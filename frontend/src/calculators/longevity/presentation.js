const INDIVIDUAL_COPY = (probability, name, age) =>
  `There is a ${probability}% chance ${name} will live to at least age ${age}.`;

export const buildLifeExpectancyPresentation = (summary) => {
  const people = Object.values(summary.individuals || {});
  const primary = people[0];
  const estimateLabel = primary?.estimateType === 'personalized'
    ? 'Personalized estimate'
    : 'SSA population estimate';
  const sourceDisclosure = primary?.sourceDisclosure
    || 'SSA 2023 period life table. Population estimate based on age and sex, using 2023 mortality rates without projected future improvement.';

  const cards = primary
    ? [75, 50, 25].map((probability) => ({
      probability,
      age: primary.thresholds[probability],
      tooltip: INDIVIDUAL_COPY(probability, primary.name, primary.thresholds[probability])
    }))
    : [];

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
    individuals: summary.individuals,
    household: summary.household,
    chartRows
  };
};
