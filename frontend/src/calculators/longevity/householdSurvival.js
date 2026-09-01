import { parseLocalIsoDate, startOfLocalDay, yearEndDate } from './dateMath';
import { startAgeFor, survivalToDate } from './individualSurvival';

const MAX_SSA_AGE = 119;
const THRESHOLD_PROBABILITIES = [75, 50, 25];

const lastSupportedYear = (person, asOf) => {
  const birth = parseLocalIsoDate(person.birthDate);
  const startAge = startAgeFor(person, asOf);
  return Math.min(
    birth.getFullYear() + MAX_SSA_AGE,
    asOf.getFullYear() + (MAX_SSA_AGE - startAge)
  );
};

const eitherAliveFromIndividuals = (people, individualSurvival) =>
  1 - people.reduce(
    (deadProduct, person) => deadProduct * (1 - individualSurvival[person.personId]),
    1
  );

export const getHouseholdLongevity = ({ people, asOfDate, modelArtifact }) => {
  const asOf = startOfLocalDay(asOfDate);
  const endYear = Math.min(...people.map((person) => lastSupportedYear(person, asOf)));
  const curve = [];

  for (let year = asOf.getFullYear(); year <= endYear; year += 1) {
    const targetDate = yearEndDate(year);
    if (targetDate < asOf) {
      continue;
    }

    const individualSurvival = {};
    people.forEach((person) => {
      individualSurvival[person.personId] = survivalToDate({
        person,
        asOfDate: asOf,
        targetDate,
        modelArtifact
      });
    });

    curve.push({
      year,
      eitherAlive: eitherAliveFromIndividuals(people, individualSurvival),
      individualSurvival
    });
  }

  const thresholds = {};
  THRESHOLD_PROBABILITIES.forEach((probability) => {
    const target = probability / 100;
    let latestYear = null;
    curve.forEach((point) => {
      if (point.eitherAlive >= target) {
        latestYear = point.year;
      }
    });
    thresholds[probability] = latestYear;
  });

  return { curve, thresholds };
};
