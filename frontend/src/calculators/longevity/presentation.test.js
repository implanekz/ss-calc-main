import { buildLongevitySummary } from './summary';
import { buildLifeExpectancyPresentation } from './presentation';
import { fixedAsOfDate, ted } from './fixtures';

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
});
