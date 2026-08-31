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
  let survival = 1;
  let cursor = asOf;

  while (cursor < target) {
    const age = attainedWholeAge(birth, cursor);
    const intervalEnd = birthdayAtAge(birth, age + 1);
    const intervalDays = daysBetween(birthdayAtAge(birth, age), intervalEnd);
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
  const currentAge = attainedWholeAge(birth, asOf);
  const curve = [];

  if (currentAge >= 0 && currentAge <= MAX_SSA_AGE) {
    const currentBirthday = birthdayAtAge(birth, currentAge);
    curve.push({
      age: currentAge,
      date: currentBirthday,
      year: currentBirthday.getFullYear(),
      survival: 1
    });
  }

  for (let age = currentAge + 1; age <= MAX_SSA_AGE; age += 1) {
    const date = birthdayAtAge(birth, age);
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
