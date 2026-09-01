import { attainedWholeAge } from './dateMath';
import {
  buildLongevityTooltip,
  formatNamesAndAges
} from '../../components/OurLifelongTimeline/longevityTimelineMath';

const INDIVIDUAL_COPY = (probability, name, age) =>
  `There is a ${probability}% chance ${name} will live to at least age ${age}.`;

const peopleFromSummary = (summary) => Object.values(summary.individuals || {});

const longerLivedPerson = (people) =>
  people.reduce((best, person) => {
    const age50 = person.thresholds?.[50];
    const bestAge = best?.thresholds?.[50];
    if (age50 == null) {
      return best;
    }
    if (bestAge == null || age50 > bestAge) {
      return person;
    }
    return best;
  }, null);

export const buildHouseholdExplanation = (summary) => {
  const people = peopleFromSummary(summary);
  if (!summary.household || people.length < 2) {
    return null;
  }
  const year50 = summary.household.thresholds?.[50];
  const year25 = summary.household.thresholds?.[25];
  if (year50 == null || year25 == null) {
    return null;
  }

  const intros = people.map((person) => {
    const age = summary.asOfDate ? attainedWholeAge(person.birthDate, summary.asOfDate) : null;
    return age == null ? person.name : `${person.name} age ${age}`;
  }).join(', ');
  const longer = longerLivedPerson(people);
  const namesAndAges50 = formatNamesAndAges({ people, year: year50 });
  const longerAge50 = longer?.thresholds?.[50];
  const longerYear50 = longer
    ? new Date(`${longer.birthDate}T12:00:00`).getFullYear() + longerAge50
    : null;
  const gap = longerYear50 == null ? null : year50 - longerYear50;
  const gapSentence = gap != null && gap > 0
    ? ` That is ${gap} year${gap === 1 ? '' : 's'} beyond that individual horizon.`
    : '';

  return `For this couple (${intros}), there is a 50% chance ${longer.name} will live to at least age ${longerAge50}. There is a 50% chance at least one of you will be alive in ${year50}. ${namesAndAges50}${gapSentence} There is a 25% chance at least one of you will be alive in ${year25}. This is the real planning horizon for Social Security: you are not planning for one lifetime, you are planning for the survivor.`;
};

const buildHouseholdCards = (summary) => {
  const people = peopleFromSummary(summary);
  return [75, 50, 25].map((probability) => {
    const capped = Boolean(summary.household.capped?.[probability]);
    const year = capped ? summary.household.capYear : summary.household.thresholds[probability];
    const namesAndAges = formatNamesAndAges({ people, year });
    return {
      probability,
      year: summary.household.thresholds[probability],
      displayValue: capped ? `Beyond ${summary.household.capYear}` : year,
      namesAndAges,
      tooltip: buildLongevityTooltip({
        kind: capped ? 'household-capped' : 'household',
        probability,
        year,
        namesAndAges,
        capYear: summary.household.capYear
      })
    };
  });
};

const buildIndividualCards = (primary) =>
  [75, 50, 25].map((probability) => ({
    probability,
    age: primary.thresholds[probability],
    displayValue: primary.capped?.[probability] ? '110+' : primary.thresholds[probability],
    tooltip: INDIVIDUAL_COPY(probability, primary.name, primary.thresholds[probability])
  }));

export const buildLifeExpectancyPresentation = (summary) => {
  const people = peopleFromSummary(summary);
  const primary = people[0];
  const estimateLabel = primary?.estimateType === 'personalized'
    ? 'Personalized estimate'
    : 'SSA population estimate';
  const sourceDisclosure = primary?.sourceDisclosure
    || 'SSA 2023 period life table. Population estimate based on age and sex, using 2023 mortality rates without projected future improvement.';

  const cards = summary.household && people.length >= 2
    ? buildHouseholdCards(summary)
    : (primary ? buildIndividualCards(primary) : []);

  const chartRows = [];
  if (people.length === 1) {
    primary.curve.forEach((point) => {
      chartRows.push({
        year: point.year,
        age: point.age,
        survival: point.survival,
        eitherAlive: point.survival
      });
    });
  } else if (people.length >= 2 && summary.household) {
    summary.household.curve.forEach((point) => {
      const row = { year: point.year, eitherAlive: point.eitherAlive };
      people.forEach((person) => {
        row[`${person.personId}Survival`] = point.individualSurvival[person.personId];
        row[`${person.personId}Age`] = point.year - new Date(`${person.birthDate}T12:00:00`).getFullYear();
      });
      chartRows.push(row);
    });
  }

  return {
    estimateLabel,
    sourceDisclosure,
    cards,
    householdExplanation: buildHouseholdExplanation(summary),
    individuals: summary.individuals,
    household: summary.household,
    chartRows
  };
};
