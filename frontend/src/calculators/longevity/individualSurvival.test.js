import { daysBetween } from './dateMath';
import { getSsaQx } from './artifacts';
import { survivalForFraction } from './hazardMath';
import { getIndividualLongevity, survivalToDate } from './individualSurvival';
import { fixedAsOfDate, ted } from './fixtures';

describe('individual survival', () => {
  test('survival starts at one on the explicit as-of date', () => {
    const person = { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' };
    expect(survivalToDate({ person, asOfDate: new Date(2026, 7, 31), targetDate: new Date(2026, 7, 31) })).toBe(1);
  });

  test('partial birthday interval uses exact day counts', () => {
    const person = { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' };
    const asOfDate = new Date(2026, 7, 31);
    const intervalStart = new Date(2026, 5, 15);
    const nextBirthday = new Date(2027, 5, 15);
    const fraction = daysBetween(asOfDate, nextBirthday) / daysBetween(intervalStart, nextBirthday);
    expect(survivalToDate({ person, asOfDate, targetDate: nextBirthday })).toBeCloseTo(
      survivalForFraction(getSsaQx('male', 61), fraction),
      14
    );
  });

  test('whole-age threshold is the greatest birthday whose survival meets the probability', () => {
    const result = getIndividualLongevity({
      person: { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' },
      asOfDate: new Date(2026, 7, 31)
    });
    [75, 50, 25].forEach((probability) => {
      const age = result.thresholds[probability];
      expect(result.curve.find((point) => point.age === age).survival).toBeGreaterThanOrEqual(probability / 100);
      expect(result.curve.find((point) => point.age === age + 1)?.survival ?? 0).toBeLessThan(probability / 100);
    });
  });

  test('individual survival is monotonically nonincreasing across birthdays', () => {
    const result = getIndividualLongevity({ person: ted, asOfDate: fixedAsOfDate });
    for (let index = 1; index < result.curve.length; index += 1) {
      expect(result.curve[index].survival).toBeLessThanOrEqual(result.curve[index - 1].survival);
    }
  });

  test('keeps true whole-age thresholds beyond the display cap', () => {
    const elder = { personId: 'elder', name: 'Elder', sex: 'male', birthDate: '1915-06-15' };
    const result = getIndividualLongevity({
      person: elder,
      asOfDate: new Date(2026, 7, 31)
    });
    [75, 50, 25].forEach((probability) => {
      const age = result.thresholds[probability];
      expect(age).toBeGreaterThan(110);
      expect(result.curve.find((point) => point.age === age).survival).toBeGreaterThanOrEqual(probability / 100);
      expect(result.curve.find((point) => point.age === age + 1)?.survival ?? 0).toBeLessThan(probability / 100);
    });
    expect(result.capped).toBeUndefined();
    expect(result.capYear).toBeUndefined();
  });
});
