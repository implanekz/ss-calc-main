const HEADLINE_TOOLTIP =
  'Headline U.S. life expectancy starts at birth, so it includes infant deaths and deaths earlier in adulthood from accidents, overdoses, and homicide. These earlier deaths pull the average down. Life expectancy at 65 looks only at people who reached 65, so it is a better starting point for retirement planning.';

const roundHalfUp = (value) => Math.floor(value + 0.5);

const peopleFromSummary = (summary) => {
  if (Array.isArray(summary.people) && summary.people.length > 0) {
    return summary.people.map((person) => ({
      name: person.name,
      birthDate: person.birthDate
    }));
  }
  return Object.values(summary.individuals || {}).map((person) => ({
    name: person.name,
    birthDate: person.birthDate
  }));
};

export const formatNamesAndAges = ({ people, year }) => {
  const ages = people.map((person) => ({
    name: person.name,
    age: year - new Date(`${person.birthDate}T12:00:00`).getFullYear()
  }));
  if (ages.length === 2 && ages[0].age === ages[1].age) {
    return `${ages[0].name} and ${ages[1].name} would both be ${ages[0].age}.`;
  }
  if (ages.length === 2) {
    return `${ages[0].name} would be ${ages[0].age}, and ${ages[1].name} would be ${ages[1].age}.`;
  }
  return ages.map((item) => `${item.name} would be ${item.age}`).join(', ') + '.';
};

export const buildLongevityTooltip = ({
  kind,
  probability,
  name,
  age,
  year,
  namesAndAges,
  capYear
}) => {
  if (kind === 'headline') {
    return HEADLINE_TOOLTIP;
  }
  if (kind === 'individual-capped') {
    return `The chance ${name} lives to at least age 110 remains above ${probability}%. This timeline does not display later ages.`;
  }
  if (kind === 'household-capped') {
    return `The chance at least one of you is alive remains above ${probability}% through ${capYear}. ${namesAndAges} The shared timeline does not display later years.`;
  }
  if (kind === 'individual') {
    return `There is a ${probability}% chance ${name} will live to at least age ${age}.`;
  }
  if (probability === 75) {
    return `There is a 75% chance at least one of you will be alive in ${year}. ${namesAndAges} A couple's chance that one person lives a long time is higher than either person's chance alone.`;
  }
  if (probability === 50) {
    return `There is a 50% chance at least one of you will be alive in ${year}. ${namesAndAges} This is why a couple's plan often needs to reach beyond either person's individual life expectancy.`;
  }
  return `There is a 25% chance at least one of you will be alive in ${year}. ${namesAndAges} The surviving spouse may need income years beyond either person's individual life expectancy.`;
};

const headlinePosition = (person) => {
  const birth = new Date(`${person.birthDate}T12:00:00`);
  const ms = person.headlineAge * 365.2425 * 24 * 60 * 60 * 1000;
  return new Date(birth.getTime() + ms);
};

export const getIndividualLongevityMarkers = (summary, axisStartYear) => {
  const markers = [];
  Object.values(summary.individuals || {}).forEach((person) => {
    if (person.headlineAge != null && person.birthDate) {
      const headlineDate = headlinePosition(person);
      const fractionalYear = headlineDate.getFullYear() + headlineDate.getMonth() / 12;
      const headlineYear = roundHalfUp(fractionalYear);
      const pastHeadline = fractionalYear < axisStartYear;
      markers.push({
        id: `${person.personId}-headline`,
        personId: person.personId,
        kind: 'headline',
        year: headlineYear,
        positionYear: pastHeadline ? axisStartYear : fractionalYear,
        chip: pastHeadline ? 'Already passed' : `Headline ${person.headlineAge.toFixed(1)}`,
        displayYear: headlineYear,
        tooltip: buildLongevityTooltip({ kind: 'headline' }),
        pinned: pastHeadline ? 'left' : null,
        emphasis: 'muted',
        probability: null
      });
    }
    [75, 50, 25].forEach((probability) => {
      const capped = person.capped?.[probability];
      const age = person.thresholds[probability];
      const birthYear = person.birthDate
        ? new Date(`${person.birthDate}T12:00:00`).getFullYear()
        : null;
      const year = capped ? person.capYear : (birthYear == null ? person.capYear : birthYear + age);
      markers.push({
        id: `${person.personId}-survival${probability}`,
        personId: person.personId,
        kind: `survival${probability}`,
        probability,
        year,
        positionYear: year,
        chip: capped ? '110+' : `${probability}%`,
        displayYear: year,
        tooltip: buildLongevityTooltip({
          kind: capped ? 'individual-capped' : 'individual',
          probability,
          name: person.name,
          age
        }),
        pinned: capped ? 'right' : null,
        emphasis: probability === 50 ? 'strong' : 'standard'
      });
    });
  });
  return markers;
};

export const getHouseholdLongevityMarkers = (summary) => {
  if (!summary.household) {
    return [];
  }
  const people = peopleFromSummary(summary);
  return [75, 50, 25].map((probability) => {
    const capped = summary.household.capped[probability];
    const year = capped ? summary.household.capYear : summary.household.thresholds[probability];
    const namesAndAges = formatNamesAndAges({ people, year });
    return {
      id: `household-survival${probability}`,
      kind: `survival${probability}`,
      probability,
      year,
      positionYear: year,
      chip: capped ? `Beyond ${summary.household.capYear}` : `${probability}%`,
      displayYear: year,
      tooltip: buildLongevityTooltip({
        kind: capped ? 'household-capped' : 'household',
        probability,
        year,
        namesAndAges,
        capYear: summary.household.capYear
      }),
      pinned: capped ? 'right' : null,
      emphasis: probability === 50 ? 'strong' : 'standard'
    };
  });
};

export const buildTimelineLongevityPresentation = (summary, axisStartYear) => {
  const startYear = axisStartYear
    ?? summary.asOfDate?.getFullYear()
    ?? new Date().getFullYear();
  const individuals = {};
  Object.values(summary.individuals || {}).forEach((person) => {
    individuals[person.personId] = {
      thresholds: person.thresholds,
      markers: getIndividualLongevityMarkers(
        { individuals: { [person.personId]: person } },
        startYear
      )
    };
  });
  const validCount = Object.keys(summary.individuals || {}).length;
  const householdMarkers = getHouseholdLongevityMarkers(summary);
  const firstPerson = Object.values(summary.individuals || {})[0];
  return {
    individuals,
    household: summary.household
      ? { thresholds: summary.household.thresholds, markers: householdMarkers }
      : null,
    householdUnavailableMessage: validCount === 1
      ? 'Complete both profiles to estimate how long at least one of you may live.'
      : null,
    sourceDisclosure: firstPerson?.sourceDisclosure,
    estimateLabel: firstPerson?.estimateType === 'personalized'
      ? 'Personalized estimate'
      : 'SSA population estimate'
  };
};
