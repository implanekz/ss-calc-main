import { getHouseholdLongevity } from './householdSurvival';
import { survivalToDate } from './individualSurvival';

describe('household survival', () => {
  test('household probability combines both people on the same December 31', () => {
    const people = [
      { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' },
      { personId: 'mary', name: 'Mary', sex: 'female', birthDate: '1970-02-10' }
    ];
    const asOfDate = new Date(2026, 7, 31);
    const result = getHouseholdLongevity({ people, asOfDate });
    expect(result.curve.length).toBeGreaterThan(0);

    const sampleYear = 2040;
    const sample = result.curve.find((point) => point.year === sampleYear);
    expect(sample).toBeDefined();
    const targetDate = new Date(sampleYear, 11, 31);
    expect(sample.individualSurvival.ted).toBeCloseTo(
      survivalToDate({ person: people[0], asOfDate, targetDate }),
      14
    );
    expect(sample.individualSurvival.mary).toBeCloseTo(
      survivalToDate({ person: people[1], asOfDate, targetDate }),
      14
    );

    result.curve.forEach(({ year, eitherAlive, individualSurvival }) => {
      expect(year).toBeGreaterThanOrEqual(2026);
      expect(eitherAlive).toBeCloseTo(
        1 - (1 - individualSurvival.ted) * (1 - individualSurvival.mary),
        14
      );
    });

    [75, 50, 25].forEach((probability) => {
      const year = result.thresholds[probability];
      expect(year).toEqual(expect.any(Number));
      const atThreshold = result.curve.find((point) => point.year === year);
      const afterThreshold = result.curve.find((point) => point.year === year + 1);
      expect(atThreshold.eitherAlive).toBeGreaterThanOrEqual(probability / 100);
      expect(afterThreshold?.eitherAlive ?? 0).toBeLessThan(probability / 100);
    });
  });
});
