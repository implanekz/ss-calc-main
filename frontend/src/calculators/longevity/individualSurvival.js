import {
  attainedWholeAge,
  birthdayAtAge,
  daysBetween,
  parseLocalIsoDate,
  startOfLocalDay
} from './dateMath';
import { survivalForFraction } from './hazardMath';
import { getAnnualQx, isCompleteLongevityProfile } from './personalization';

const MAX_SSA_AGE = 119;
const THRESHOLD_PROBABILITIES = [75, 50, 25];

const annualQx = (person, age, modelArtifact) => getAnnualQx({
  sex: person.sex,
  age,
  profile: person.profile,
  modelArtifact
});

export const startAgeFor = (person, asOfDate) => {
  const dobAge = attainedWholeAge(person.birthDate, asOfDate);
  return Number.isFinite(person.currentAge) ? person.currentAge : dobAge;
};

export const survivalToDate = ({ person, asOfDate, targetDate, modelArtifact }) => {
  const asOf = startOfLocalDay(asOfDate);
  const target = startOfLocalDay(targetDate);
  if (target.getTime() === asOf.getTime()) {
    return 1;
  }
  if (target < asOf) {
    throw new Error('targetDate must be on or after asOfDate');
  }

  const birth = parseLocalIsoDate(person.birthDate);
  const ageOffset = startAgeFor(person, asOf) - attainedWholeAge(birth, asOf);
  let survival = 1;
  let cursor = asOf;

  while (cursor < target) {
    const dobAge = attainedWholeAge(birth, cursor);
    const age = dobAge + ageOffset;
    const intervalEnd = birthdayAtAge(birth, dobAge + 1);
    const intervalDays = daysBetween(birthdayAtAge(birth, dobAge), intervalEnd);
    const stepEnd = target < intervalEnd ? target : intervalEnd;
    const fraction = daysBetween(cursor, stepEnd) / intervalDays;
    survival *= survivalForFraction(annualQx(person, age, modelArtifact), fraction);
    cursor = stepEnd;
  }

  return survival;
};

export const getIndividualLongevity = ({ person, asOfDate, modelArtifact }) => {
  const asOf = startOfLocalDay(asOfDate);
  const birth = parseLocalIsoDate(person.birthDate);
  const dobAge = attainedWholeAge(birth, asOf);
  const currentAge = startAgeFor(person, asOf);
  const curve = [];

  if (currentAge >= 0 && currentAge <= MAX_SSA_AGE) {
    const currentBirthday = birthdayAtAge(birth, dobAge);
    curve.push({
      age: currentAge,
      date: currentBirthday,
      year: currentBirthday.getFullYear(),
      survival: 1
    });
  }

  for (let age = currentAge + 1; age <= MAX_SSA_AGE; age += 1) {
    const date = birthdayAtAge(birth, dobAge + (age - currentAge));
    curve.push({
      age,
      date,
      year: date.getFullYear(),
      survival: survivalToDate({ person, asOfDate: asOf, targetDate: date, modelArtifact })
    });
  }

  const thresholds = {};
  THRESHOLD_PROBABILITIES.forEach((probability) => {
    const target = probability / 100;
    let greatestAge = null;
    curve.forEach((point) => {
      if (point.survival >= target) {
        greatestAge = point.age;
      }
    });
    thresholds[probability] = greatestAge;
  });

  return {
    personId: person.personId,
    name: person.name,
    sex: person.sex,
    birthDate: person.birthDate,
    estimateType: isCompleteLongevityProfile(person.profile) && modelArtifact
      ? 'personalized'
      : 'ssa-population',
    curve,
    thresholds
  };
};
