import { buildLongevitySummary } from '../../calculators/longevity/summary';
import { fixedAsOfDate, ted, mary } from '../../calculators/longevity/fixtures';
import {
  buildLongevityTooltip,
  buildTimelineLongevityPresentation,
  formatNamesAndAges,
  getHouseholdLongevityMarkers,
  getIndividualLongevityMarkers
} from './longevityTimelineMath';

describe('longevity timeline copy', () => {
  test('headline copy explains the retirement-planning comparison', () => {
    expect(buildLongevityTooltip({ kind: 'headline' })).toBe(
      'Headline U.S. life expectancy starts at birth, so it includes infant deaths and deaths earlier in adulthood from accidents, overdoses, and homicide. These earlier deaths pull the average down. Life expectancy at 65 looks only at people who reached 65, so it is a better starting point for retirement planning.'
    );
  });

  test('individual threshold copy uses at least age', () => {
    expect(buildLongevityTooltip({
      kind: 'individual',
      probability: 75,
      name: 'Ted',
      age: 78
    })).toBe('There is a 75% chance Ted will live to at least age 78.');
    expect(buildLongevityTooltip({
      kind: 'individual',
      probability: 50,
      name: 'Ted',
      age: 85
    })).toBe('There is a 50% chance Ted will live to at least age 85.');
    expect(buildLongevityTooltip({
      kind: 'individual',
      probability: 25,
      name: 'Mary',
      age: 91
    })).toBe('There is a 25% chance Mary will live to at least age 91.');
  });

  test('equal-age household copy uses the shared-age sentence', () => {
    expect(formatNamesAndAges({
      people: [
        { name: 'Ted', birthDate: '1965-06-15' },
        { name: 'Mary', birthDate: '1965-06-15' }
      ],
      year: 2057
    })).toBe('Ted and Mary would both be 92.');
  });

  test('unequal-age household copy lists both ages in the shared year', () => {
    expect(formatNamesAndAges({
      people: [
        { name: 'Ted', birthDate: '1965-06-15' },
        { name: 'Mary', birthDate: '1970-02-10' }
      ],
      year: 2057
    })).toBe('Ted would be 92, and Mary would be 87.');
  });

  test('household probability copy uses the approved sentence for each threshold', () => {
    const namesAndAges = 'Ted would be 92, and Mary would be 87.';
    expect(buildLongevityTooltip({
      kind: 'household',
      probability: 75,
      year: 2052,
      namesAndAges
    })).toBe(
      `There is a 75% chance at least one of you will be alive in 2052. ${namesAndAges} A couple's chance that one person lives a long time is higher than either person's chance alone.`
    );
    expect(buildLongevityTooltip({
      kind: 'household',
      probability: 50,
      year: 2057,
      namesAndAges
    })).toBe(
      `There is a 50% chance at least one of you will be alive in 2057. ${namesAndAges} This is why a couple's plan often needs to reach beyond either person's individual life expectancy.`
    );
    expect(buildLongevityTooltip({
      kind: 'household',
      probability: 25,
      year: 2061,
      namesAndAges
    })).toBe(
      `There is a 25% chance at least one of you will be alive in 2061. ${namesAndAges} The surviving spouse may need income years beyond either person's individual life expectancy.`
    );
  });

  test('household thresholds beyond support do not claim a crossing year', () => {
    const beyondCapSummary = {
      household: {
        thresholds: { 75: 2045, 50: 2054, 25: null },
        capped: { 75: false, 50: false, 25: true },
        capYear: 2075
      },
      individuals: {
        ted: { name: 'Ted', birthDate: '1965-06-15' },
        mary: { name: 'Mary', birthDate: '1970-02-10' }
      }
    };
    const marker = getHouseholdLongevityMarkers(beyondCapSummary)
      .find((item) => item.probability === 25);
    expect(marker.chip).toBe('Beyond 2075');
    expect(marker.tooltip).toContain('remains above');
    expect(marker.tooltip).not.toContain('chance at least one of you will be alive in');
  });

  test('individual thresholds beyond age 110 use the capped tooltip', () => {
    const marker = getIndividualLongevityMarkers({
      individuals: {
        ted: {
          personId: 'ted',
          name: 'Ted',
          thresholds: { 75: 108, 50: 110, 25: 110 },
          capped: { 75: false, 50: true, 25: true },
          capYear: 2075
        }
      }
    }).find((item) => item.personId === 'ted' && item.probability === 25);
    expect(marker.chip).toBe('110+');
    expect(marker.tooltip).toBe(
      'The chance Ted lives to at least age 110 remains above 25%. This timeline does not display later ages.'
    );
  });

  test('one valid spouse keeps individual flags but omits household flags', () => {
    const summary = buildLongevitySummary({
      people: [ted, { ...mary, sex: null }],
      asOfDate: fixedAsOfDate
    });
    const model = buildTimelineLongevityPresentation(summary, 2026);
    expect(model.individuals.ted.markers).toHaveLength(4);
    expect(model.household).toBeNull();
    expect(model.householdUnavailableMessage).toBe(
      'Complete both profiles to estimate how long at least one of you may live.'
    );
  });
});
