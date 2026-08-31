import { getHouseholdLongevity } from './householdSurvival';

describe('household survival', () => {
  test('household probability combines both people on the same December 31', () => {
    const result = getHouseholdLongevity({
      people: [
        { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' },
        { personId: 'mary', name: 'Mary', sex: 'female', birthDate: '1970-02-10' }
      ],
      asOfDate: new Date(2026, 7, 31)
    });
    expect(result.curve.length).toBeGreaterThan(0);
    result.curve.forEach(({ year, eitherAlive, individualSurvival }) => {
      expect(year).toBeGreaterThanOrEqual(2026);
      expect(eitherAlive).toBeCloseTo(
        1 - (1 - individualSurvival.ted) * (1 - individualSurvival.mary),
        14
      );
    });
  });
});
