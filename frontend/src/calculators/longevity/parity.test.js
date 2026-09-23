import { buildLongevitySummary } from './summary';
import { buildLifeExpectancyPresentation } from './presentation';
import { calculateProjection, combineProjections } from '../showMeTheMoney/projections';
import { buildTimelineLongevityPresentation } from '../../components/OurLifelongTimeline/longevityTimelineMath';
import { maryProjectionInputs, tedAndMary, tedProjectionInputs } from './fixtures';

describe('life expectancy and timeline parity', () => {
  test('life expectancy and timeline adapters use identical thresholds', () => {
    const summary = buildLongevitySummary({
      people: tedAndMary,
      asOfDate: new Date(2026, 7, 31)
    });
    const lifeModel = buildLifeExpectancyPresentation(summary);
    const timelineModel = buildTimelineLongevityPresentation(summary);
    expect(timelineModel.individuals.ted.thresholds).toEqual(lifeModel.individuals.ted.thresholds);
    expect(timelineModel.household.thresholds).toEqual(lifeModel.household.thresholds);
  });

  test('preferred projections cover the complete longevity axis', () => {
    const longevitySummary = buildLongevitySummary({
      people: tedAndMary,
      asOfDate: new Date(2026, 7, 31)
    });
    const primary = calculateProjection({
      ...tedProjectionInputs,
      asOfDate: new Date(2026, 7, 31),
      endYear: longevitySummary.axisEndYear
    });
    const spouse = calculateProjection({
      ...maryProjectionInputs,
      asOfDate: new Date(2026, 7, 31),
      endYear: longevitySummary.axisEndYear
    });
    const combined = combineProjections({
      primaryProjection: primary,
      spouseProjection: spouse,
      isMarried: true
    });
    expect(combined.monthly[longevitySummary.axisEndYear]).toBeDefined();
    expect(combined.cumulative[longevitySummary.axisEndYear]).toBeDefined();
  });
});
