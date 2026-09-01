import { buildLongevitySummary } from './summary';
import { buildLifeExpectancyPresentation } from './presentation';
import { fixedAsOfDate, ted, tedAndMary } from './fixtures';

describe('life expectancy presentation', () => {
  test('individual cards use whole-age thresholds and at-least wording', () => {
    const summary = buildLongevitySummary({ people: [ted], asOfDate: fixedAsOfDate });
    const model = buildLifeExpectancyPresentation(summary);
    expect(model.cards.map((card) => card.probability)).toEqual([75, 50, 25]);
    expect(model.cards[1].tooltip).toContain('live to at least age');
  });

  test('incomplete answers disclose an SSA population estimate', () => {
    const summary = buildLongevitySummary({ people: [ted], asOfDate: fixedAsOfDate });
    const model = buildLifeExpectancyPresentation(summary);
    expect(model.sourceDisclosure).toContain('SSA 2023 period life table');
    expect(model.sourceDisclosure).toContain('without projected future improvement');
    expect(model.estimateLabel).toBe('SSA population estimate');
  });

  test('missing DOB or unsupported sex produces no individual estimate', () => {
    const missingDob = buildLongevitySummary({
      people: [{ ...ted, birthDate: null }],
      asOfDate: fixedAsOfDate
    });
    const unsupportedSex = buildLongevitySummary({
      people: [{ ...ted, sex: 'unknown' }],
      asOfDate: fixedAsOfDate
    });
    expect(buildLifeExpectancyPresentation(missingDob).individuals.ted).toBeUndefined();
    expect(buildLifeExpectancyPresentation(unsupportedSex).individuals.ted).toBeUndefined();
  });

  test('couple cards use household years, names, and at-least-one wording', () => {
    const summary = buildLongevitySummary({ people: tedAndMary, asOfDate: fixedAsOfDate });
    const model = buildLifeExpectancyPresentation(summary);
    expect(model.cards.map((card) => card.probability)).toEqual([75, 50, 25]);
    expect(model.cards[1].year).toBe(summary.household.thresholds[50]);
    expect(model.cards[1].tooltip).toContain('at least one of you will be alive in');
    expect(model.cards[1].namesAndAges).toMatch(/Ted/);
    expect(model.cards[1].namesAndAges).toMatch(/Mary/);
    expect(model.householdExplanation).toContain('live to at least age');
    expect(model.householdExplanation).toContain(String(summary.household.thresholds[50]));
    expect(model.householdExplanation).not.toMatch(/multiplicative/i);
  });
});
