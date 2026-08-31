import { getHeadlineLifeExpectancy } from './artifacts';
import { attainedWholeAge, birthdayAtAge } from './dateMath';
import { getHouseholdLongevity } from './householdSurvival';
import { getIndividualLongevity } from './individualSurvival';

const MIN_AGE = 0;
const MAX_AGE = 119;
const INDIVIDUAL_DISPLAY_CAP_AGE = 110;
const THRESHOLD_PROBABILITIES = [75, 50, 25];
const SSA_SOURCE_DISCLOSURE =
  'SSA 2023 period life table. Population estimate based on age and sex, using 2023 mortality rates without projected future improvement.';

const isSupportedSex = (sex) => sex === 'male' || sex === 'female';

const isCalculablePerson = (person, asOfDate) => {
  if (!person?.birthDate || !isSupportedSex(person.sex)) {
    return false;
  }
  const age = attainedWholeAge(person.birthDate, asOfDate);
  return age >= MIN_AGE && age <= MAX_AGE;
};

export const getHouseholdCapYear = (people) => {
  const years = people.map((person) => new Date(`${person.birthDate}T12:00:00`).getFullYear());
  const earlierBirthYear = Math.min(...years);
  const laterBirthYear = Math.max(...years);
  return Math.min(laterBirthYear + 110, earlierBirthYear + 119);
};

export const roundAxisEnd = ({ latestYear, capYear }) =>
  latestYear >= capYear ? capYear : Math.min(capYear, Math.ceil(latestYear / 5) * 5);

const applyIndividualDisplayCap = (longevity) => {
  const capYear = birthdayAtAge(longevity.birthDate, INDIVIDUAL_DISPLAY_CAP_AGE).getFullYear();
  const thresholds = {};
  const capped = {};
  THRESHOLD_PROBABILITIES.forEach((probability) => {
    const age = longevity.thresholds[probability];
    const exceedsCap = age != null && age > INDIVIDUAL_DISPLAY_CAP_AGE;
    thresholds[probability] = exceedsCap ? INDIVIDUAL_DISPLAY_CAP_AGE : age;
    capped[probability] = Boolean(exceedsCap);
  });
  return {
    ...longevity,
    thresholds,
    capped,
    capYear
  };
};

const applyHouseholdDisplayCap = (household, capYear) => {
  const thresholds = {};
  const capped = {};
  THRESHOLD_PROBABILITIES.forEach((probability) => {
    const year = household.thresholds[probability];
    const exceedsCap = year != null && year > capYear;
    thresholds[probability] = exceedsCap ? null : year;
    capped[probability] = Boolean(exceedsCap);
  });
  return {
    curve: household.curve,
    thresholds,
    capped,
    capYear
  };
};

const latestDisplayedYear = ({ individuals, household }) => {
  const years = [];
  Object.values(individuals).forEach((person) => {
    THRESHOLD_PROBABILITIES.forEach((probability) => {
      const age = person.thresholds[probability];
      if (age == null) {
        return;
      }
      years.push(
        person.capped[probability]
          ? person.capYear
          : birthdayAtAge(person.birthDate, age).getFullYear()
      );
    });
  });
  if (household) {
    THRESHOLD_PROBABILITIES.forEach((probability) => {
      if (household.capped[probability]) {
        years.push(household.capYear);
      } else if (household.thresholds[probability] != null) {
        years.push(household.thresholds[probability]);
      }
    });
  }
  return years.length === 0 ? null : Math.max(...years);
};

export const buildLongevitySummary = ({ people, asOfDate }) => {
  const individuals = {};
  const validPeople = people.filter((person) => isCalculablePerson(person, asOfDate));

  validPeople.forEach((person) => {
    const longevity = applyIndividualDisplayCap(getIndividualLongevity({ person, asOfDate }));
    individuals[person.personId] = {
      ...longevity,
      headlineAge: getHeadlineLifeExpectancy(person.sex),
      sourceDisclosure: SSA_SOURCE_DISCLOSURE
    };
  });

  let household = null;
  let capYear = asOfDate.getFullYear();
  if (validPeople.length === 1) {
    capYear = individuals[validPeople[0].personId].capYear;
  } else if (validPeople.length >= 2) {
    capYear = getHouseholdCapYear(validPeople);
    household = applyHouseholdDisplayCap(
      getHouseholdLongevity({ people: validPeople, asOfDate }),
      capYear
    );
  }

  const latestYear = latestDisplayedYear({ individuals, household }) ?? capYear;

  return {
    asOfDate,
    individuals,
    household,
    axisEndYear: roundAxisEnd({ latestYear, capYear }),
    modelVersion: null
  };
};
