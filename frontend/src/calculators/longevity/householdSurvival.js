import { parseLocalIsoDate, startOfLocalDay, yearEndDate } from './dateMath';
import { survivalToDate } from './individualSurvival';

const MAX_SSA_AGE = 119;
const THRESHOLD_PROBABILITIES = [75, 50, 25];

const lastSupportedYear = (person) => parseLocalIsoDate(person.birthDate).getFullYear() + MAX_SSA_AGE;

const eitherAliveFromIndividuals = (people, individualSurvival) =>
  1 - people.reduce(
    (deadProduct, person) => deadProduct * (1 - individualSurvival[person.personId]),
    1
  );

export const getHouseholdLongevity = ({ people, asOfDate }) => {
  const asOf = startOfLocalDay(asOfDate);
  const endYear = Math.min(...people.map(lastSupportedYear));
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
        targetDate
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
