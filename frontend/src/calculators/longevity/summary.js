import { getHeadlineLifeExpectancy } from './artifacts';
import { attainedWholeAge, birthdayAtAge } from './dateMath';
import { getHouseholdLongevity } from './householdSurvival';
import { getIndividualLongevity } from './individualSurvival';
import {
  MortalityModelError,
  PERSONALIZED_SOURCE_DISCLOSURE,
  isCompleteLongevityProfile
} from './personalization';

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

const birthYearOf = (person) => {
  if (!person?.birthDate) {
    return NaN;
  }
  return new Date(`${person.birthDate}T12:00:00`).getFullYear();
};

const fallbackAxisEndFromPeople = (people = []) => {
  const years = people.map(birthYearOf).filter((year) => Number.isFinite(year));
  if (years.length === 0) {
    return null;
  }
  return Math.max(...years) + 95;
};

export const getHouseholdCapYear = (people) => {
  const years = people.map(birthYearOf);
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

const sourceDisclosureFor = (longevity, modelArtifact) => {
  if (longevity.estimateType === 'personalized' && modelArtifact?.modelVersion) {
    return PERSONALIZED_SOURCE_DISCLOSURE(modelArtifact.modelVersion);
  }
  return SSA_SOURCE_DISCLOSURE;
};

const summarizePerson = ({ person, asOfDate, modelArtifact }) => {
  const longevity = applyIndividualDisplayCap(
    getIndividualLongevity({ person, asOfDate, modelArtifact })
  );
  return {
    ...longevity,
    profile: person.profile || null,
    headlineAge: getHeadlineLifeExpectancy(person.sex),
    sourceDisclosure: sourceDisclosureFor(longevity, modelArtifact)
  };
};

export const buildLongevitySummary = ({ people, asOfDate, modelArtifact = null, onDiagnostic }) => {
  const individuals = {};
  const validPeople = people.filter((person) => isCalculablePerson(person, asOfDate));
  let usedModelVersion = null;

  validPeople.forEach((person) => {
    const wantsPersonalization = isCompleteLongevityProfile(person.profile) && modelArtifact;
    try {
      const summarized = summarizePerson({
        person,
        asOfDate,
        modelArtifact: wantsPersonalization ? modelArtifact : null
      });
      individuals[person.personId] = summarized;
      if (summarized.estimateType === 'personalized') {
        usedModelVersion = modelArtifact.modelVersion;
      }
    } catch (error) {
      if (!(error instanceof MortalityModelError)) {
        throw error;
      }
      if (typeof onDiagnostic === 'function') {
        onDiagnostic({ code: 'INVALID_MORTALITY_MODEL', cause: error });
      }
      individuals[person.personId] = summarizePerson({
        person,
        asOfDate,
        modelArtifact: null
      });
    }
  });

  let household = null;
  let capYear = fallbackAxisEndFromPeople(people);
  if (validPeople.length === 1) {
    capYear = individuals[validPeople[0].personId].capYear;
  } else if (validPeople.length >= 2) {
    capYear = getHouseholdCapYear(validPeople);
    const householdPeople = validPeople.map((person) => ({
      ...person,
      profile: individuals[person.personId].estimateType === 'personalized' ? person.profile : null
    }));
    try {
      household = applyHouseholdDisplayCap(
        getHouseholdLongevity({
          people: householdPeople,
          asOfDate,
          modelArtifact: usedModelVersion ? modelArtifact : null
        }),
        capYear
      );
    } catch (error) {
      if (!(error instanceof MortalityModelError)) {
        throw error;
      }
      if (typeof onDiagnostic === 'function') {
        onDiagnostic({ code: 'INVALID_MORTALITY_MODEL', cause: error });
      }
      household = applyHouseholdDisplayCap(
        getHouseholdLongevity({ people: validPeople, asOfDate, modelArtifact: null }),
        capYear
      );
    }
  }

  const latestYear = latestDisplayedYear({ individuals, household }) ?? capYear;
  const axisEndYear = Number.isFinite(latestYear) && Number.isFinite(capYear)
    ? roundAxisEnd({ latestYear, capYear })
    : fallbackAxisEndFromPeople(people);

  return {
    asOfDate,
    individuals,
    household,
    axisEndYear,
    modelVersion: usedModelVersion
  };
};
