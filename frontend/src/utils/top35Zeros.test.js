import { countZerosInTop35 } from './top35Zeros';

describe('countZerosInTop35', () => {
  it('counts zeros inside the highest 35 years, not 35 minus all non-zero years', () => {
    const rows = [
      ...Array.from({ length: 40 }, (_, i) => ({ year: 1980 + i, earnings: 50000, isProjected: false })),
      { year: 1979, earnings: 0, isProjected: false }
    ];
    expect(countZerosInTop35(rows)).toBe(0);
  });

  it('ignores projected rows', () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => ({ year: 1990 + i, earnings: 50000, isProjected: false })),
      { year: 2027, earnings: 90000, isProjected: true }
    ];
    expect(countZerosInTop35(rows)).toBe(5);
  });
});
