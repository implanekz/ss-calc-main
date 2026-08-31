import { getHeadlineLifeExpectancy } from './artifacts';
import { fixedAsOfDate, mary, ted, tedAndMary } from './fixtures';
import { getHouseholdLongevity } from './householdSurvival';
import { getIndividualLongevity } from './individualSurvival';
import {
  buildLongevitySummary,
  getHouseholdCapYear,
  roundAxisEnd
} from './summary';

describe('longevity summary', () => {
  test('household cap is the earlier of later-born 110 and earlier-born 119', () => {
    expect(getHouseholdCapYear(tedAndMary)).toBe(2080);
  });

  test('roundAxisEnd snaps up to a five-year ruler unless the cap binds', () => {
    expect(roundAxisEnd({ latestYear: 2072, capYear: 2080 })).toBe(2075);
    expect(roundAxisEnd({ latestYear: 2080, capYear: 2080 })).toBe(2080);
    expect(roundAxisEnd({ latestYear: 2081, capYear: 2080 })).toBe(2080);
  });

  test('buildLongevitySummary returns the shared SSA-only public shape', () => {
    const summary = buildLongevitySummary({ people: tedAndMary, asOfDate: fixedAsOfDate });

    expect(summary.asOfDate).toBe(fixedAsOfDate);
    expect(summary.modelVersion).toBe(null);
    expect(summary.individuals.ted).toMatchObject({
      personId: 'ted',
      name: 'Ted',
      sex: 'male',
      birthDate: '1965-06-15',
      estimateType: 'ssa-population',
      headlineAge: getHeadlineLifeExpectancy('male')
    });
    expect(summary.individuals.ted.sourceDisclosure).toBe(
      'SSA 2023 period life table. Population estimate based on age and sex, using 2023 mortality rates without projected future improvement.'
    );
    expect(summary.household.capYear).toBe(2080);
    const household25 = summary.household.thresholds[25];
    expect(household25).toEqual(expect.any(Number));
    expect(summary.axisEndYear).toBeGreaterThanOrEqual(household25);
    expect(summary.axisEndYear).toBeLessThanOrEqual(2080);
  });

  test('pins individual 110+ and household Beyond capYear only in the summary', () => {
    const elder = { personId: 'elder', name: 'Elder', sex: 'male', birthDate: '1915-06-15' };
    const spouse = { personId: 'spouse', name: 'Spouse', sex: 'female', birthDate: '1915-01-10' };
    const asOfDate = new Date(2026, 7, 31);

    const rawIndividual = getIndividualLongevity({ person: elder, asOfDate });
    const individualSummary = buildLongevitySummary({ people: [elder], asOfDate });
    [75, 50, 25].forEach((probability) => {
      expect(rawIndividual.thresholds[probability]).toBeGreaterThan(110);
      expect(individualSummary.individuals.elder.thresholds[probability]).toBe(110);
      expect(individualSummary.individuals.elder.capped[probability]).toBe(true);
    });
    expect(individualSummary.individuals.elder.capYear).toBe(2025);
    expect(individualSummary.axisEndYear).toBe(individualSummary.individuals.elder.capYear);

    const people = [elder, spouse];
    const capYear = getHouseholdCapYear(people);
    const rawHousehold = getHouseholdLongevity({ people, asOfDate });
    const householdSummary = buildLongevitySummary({ people, asOfDate });
    expect(capYear).toBe(2025);
    [75, 50, 25].forEach((probability) => {
      expect(rawHousehold.thresholds[probability]).toBeGreaterThan(capYear);
      expect(householdSummary.household.thresholds[probability]).toBeNull();
      expect(householdSummary.household.capped[probability]).toBe(true);
    });
    expect(householdSummary.household.capYear).toBe(capYear);
    expect(householdSummary.axisEndYear).toBe(capYear);
  });

  test('omits incalculable people and household rows', () => {
    const missingDob = buildLongevitySummary({
      people: [{ ...ted, birthDate: null }, mary],
      asOfDate: fixedAsOfDate
    });
    const unsupportedSex = buildLongevitySummary({
      people: [ted, { ...mary, sex: 'unknown' }],
      asOfDate: fixedAsOfDate
    });
    const single = buildLongevitySummary({ people: [ted], asOfDate: fixedAsOfDate });

    expect(missingDob.individuals.ted).toBeUndefined();
    expect(missingDob.individuals.mary.personId).toBe('mary');
    expect(missingDob.household).toBe(null);
    expect(unsupportedSex.individuals.mary).toBeUndefined();
    expect(unsupportedSex.household).toBe(null);
    expect(single.household).toBe(null);
    expect(single.individuals.ted.capYear).toBe(2075);
  });
});
