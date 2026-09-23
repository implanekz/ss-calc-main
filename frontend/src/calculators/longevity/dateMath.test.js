import {
  birthdayAtAge,
  daysBetween,
  parseLocalIsoDate,
  yearEndDate
} from './dateMath';

describe('local date math', () => {
  test('parses ISO dates as local calendar dates', () => {
    const date = parseLocalIsoDate('1965-06-15');
    expect(date.getFullYear()).toBe(1965);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(15);
  });

  test('birthday intervals include leap days', () => {
    const start = birthdayAtAge('1965-06-15', 58);
    const end = birthdayAtAge('1965-06-15', 59);
    expect(start).toEqual(new Date(2023, 5, 15));
    expect(end).toEqual(new Date(2024, 5, 15));
    expect(daysBetween(start, end)).toBe(366);
  });

  test('household evaluation uses December 31 of the calendar year', () => {
    const date = yearEndDate(2026);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(31);
  });
});
