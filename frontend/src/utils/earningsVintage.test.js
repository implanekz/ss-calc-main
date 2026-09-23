import { describeEarningsVintage, lastBankedEarningsYear } from './earningsVintage';

describe('lastBankedEarningsYear', () => {
  it('ignores projected and zero years', () => {
    expect(lastBankedEarningsYear([
      { year: 2023, earnings: 50000, isProjected: false },
      { year: 2024, earnings: 0, isProjected: false },
      { year: 2025, earnings: 50000, isProjected: true }
    ])).toBe(2023);
  });
});

describe('describeEarningsVintage', () => {
  const today = new Date('2026-08-30');

  it('returns unknown when there is no statement date (typed PIA)', () => {
    const result = describeEarningsVintage({
      statementDate: null,
      rows: [{ year: 2025, earnings: 50000, isProjected: false }],
      today
    });
    expect(result.kind).toBe('unknown');
    expect(result.message).toBeNull();
  });

  it('prompts for a re-download when the file is old and years are missing', () => {
    const result = describeEarningsVintage({
      statementDate: '2023-01-15',
      rows: [{ year: 2022, earnings: 50000, isProjected: false }],
      today
    });
    expect(result.kind).toBe('redownload');
    expect(result.dataGapYears).toBe(3);
    expect(result.message).toMatch(/fresh XML/i);
  });

  it('explains SSA posting lag when the file is fresh but last year is missing', () => {
    const result = describeEarningsVintage({
      statementDate: '2026-08-01',
      rows: [{ year: 2024, earnings: 50000, isProjected: false }],
      today
    });
    expect(result.kind).toBe('posting_lag');
    expect(result.dataGapYears).toBe(1);
    expect(result.message).toMatch(/has not posted/i);
    expect(result.message).not.toMatch(/fresh XML/i);
  });

  it('is current when the file is fresh and the last banked year is current-year-minus-one', () => {
    const result = describeEarningsVintage({
      statementDate: '2026-08-01',
      rows: [{ year: 2025, earnings: 50000, isProjected: false }],
      today
    });
    expect(result.kind).toBe('current');
    expect(result.message).toBeNull();
  });
});
