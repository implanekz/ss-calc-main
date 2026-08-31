import { ageInMonths, calculateProjection, combineProjections } from './projections';

describe('show me the money projections', () => {
  test('calculates exact age in months', () => {
    expect(ageInMonths(new Date('1965-02-03'), new Date('2027-02-02'))).toBe(743);
    expect(ageInMonths(new Date('1965-02-03'), new Date('2027-02-03'))).toBe(744);
  });

  test('calculates a filing-at-62 projection without inflation', () => {
    const projection = calculateProjection({
      pia: 3000,
      dob: '1965-02-03',
      filingYear: 62,
      filingMonth: 0,
      inflationRate: 0,
      asOfDate: new Date('2027-02-03')
    });

    expect(projection.birthYear).toBe(1965);
    expect(projection.monthly[2027]).toBeCloseTo(2100, 2);
    expect(projection.cumulative[2027]).toBeCloseTo(23100, 2);
  });

  test('a filingMonth that carries past the birth month lands the claim in the following calendar year', () => {
    // Born October (month index 9). Filing at 63 years + 6 months = claim age 63.5, which
    // falls 6 months after the person's 63rd birthday -- i.e. April of the NEXT calendar
    // year, not the October of birthYear+63 that filingMonth=0 would land in. Both the
    // claiming year and the partial-year month count must reflect that carry.
    const projection = calculateProjection({
      pia: 3000,
      dob: '1965-10-15',
      filingYear: 63,
      filingMonth: 6,
      inflationRate: 0,
      asOfDate: new Date('2028-10-15')
    });

    expect(projection.claimingCalendarYear).toBe(2029); // 1965 + 63 + 1 (carried), not 2028
    expect(projection.monthly[2028]).toBe(0); // no benefit yet in the naive birthYear+filingYear
    expect(projection.monthly[2029]).toBeCloseTo(2325, 2); // 3000 * earlyReductionFactor(-42 months)
    // Partial first year: claim lands in April (month index 3), so only 12-3=9 months of
    // payment land in 2029, not a full 12 -- 2325 * 9 = 20,925, not 2325 * 12 = 27,900.
    expect(projection.cumulative[2029]).toBeCloseTo(20925, 2);
  });

  test('combines two projections with different partial first years, not a flat monthly * 12', () => {
    // Ted: born June 1965, files at 62 -- already collecting a full 12 months by 2032.
    // Wendy: born June 1970, files at 62 -- 2032 is HER partial first year (starts in June,
    // month index 5, so only 12-5=7 months of payment land in 2032).
    const tedProjection = calculateProjection({
      pia: 2500, dob: '1965-06-15', filingYear: 62, filingMonth: 0, inflationRate: 0, asOfDate: new Date('2032-06-15')
    });
    const wendyProjection = calculateProjection({
      pia: 2000, dob: '1970-06-15', filingYear: 62, filingMonth: 0, inflationRate: 0, asOfDate: new Date('2032-06-15')
    });

    const combined = combineProjections({ primaryProjection: tedProjection, spouseProjection: wendyProjection, isMarried: true });

    expect(combined.monthly[2032]).toBe(1750 + 1400); // both already at their steady-state rate
    // The combined cumulative through 2032 must equal the sum of each person's OWN correctly
    // partial-year-aware cumulative (Ted's own partial first year was 2027, five years earlier;
    // Wendy's is 2032 itself) -- not (1750+1400)*12=37,800 repeated every year, which would
    // both overcount Wendy's unclaimed 2032 months and Ted's unclaimed 2027 months.
    expect(combined.cumulative[2032]).toBeCloseTo(tedProjection.cumulative[2032] + wendyProjection.cumulative[2032], 2);
    // Concretely: Ted collected a partial 7 months in 2027 then full years through 2032 (5.5
    // years' worth); Wendy collected only her own partial 7 months in 2032.
    expect(wendyProjection.cumulative[2032]).toBeCloseTo(1400 * 7, 2);
  });

  test('survivor-year monthly and annual come from the same winning spouse, even mid-partial-year', () => {
    // Ted (primary): PIA 1400, files at 62, born 1965 -- already a full year into collecting by
    // 2032. Wendy (spouse): PIA 1750, files at 62, born 1970 -- 2032 is HER partial first year
    // (June birthday, 7 months). Wendy's MONTHLY rate ($1,225) is higher than Ted's ($980), but
    // because her year is partial, her ANNUAL contribution ($1,225*7=$8,575) is smaller than
    // Ted's full-year one ($980*12=$11,760) -- a naive independent max(annual) would credit
    // Ted's amount to the household even though Wendy is the higher earner who should be the
    // survivor benefit here.
    const tedProjection = calculateProjection({
      pia: 1400, dob: '1965-06-15', filingYear: 62, filingMonth: 0, inflationRate: 0, asOfDate: new Date('2032-06-15')
    });
    const wendyProjection = calculateProjection({
      pia: 1750, dob: '1970-06-15', filingYear: 62, filingMonth: 0, inflationRate: 0, asOfDate: new Date('2032-06-15')
    });

    const combined = combineProjections({
      primaryProjection: tedProjection,
      spouseProjection: wendyProjection,
      isMarried: true,
      prematureDeath: true,
      deathYear: 2032
    });

    expect(combined.monthly[2032]).toBe(1225); // Wendy's higher rate wins
    const annual2032 = combined.cumulative[2032] - (combined.cumulative[2031] || 0);
    expect(annual2032).toBeCloseTo(1225 * 7, 2); // Wendy's own (partial) annual, not Ted's
  });

  test('combines spouse projections and preserves survivor-style max after death year', () => {
    const primaryProjection = {
      monthly: { 2030: 2000, 2031: 2100 },
      cumulative: { 2030: 24000, 2031: 49200 }
    };
    const spouseProjection = {
      monthly: { 2030: 1000, 2031: 1100 },
      cumulative: { 2030: 12000, 2031: 25200 }
    };

    const combined = combineProjections({
      primaryProjection,
      spouseProjection,
      isMarried: true,
      prematureDeath: true,
      deathYear: 2031
    });

    expect(combined.monthly[2030]).toBe(3000);
    expect(combined.monthly[2031]).toBe(2100);
    expect(combined.cumulative[2031]).toBe(61200);
  });

  test('explicit endYear produces financial data through the final displayed year', () => {
    const projection = calculateProjection({
      pia: 2500,
      dob: '1965-06-15',
      filingYear: 67,
      inflationRate: 0.025,
      asOfDate: new Date(2026, 7, 31),
      endYear: 2070
    });
    expect(Object.keys(projection.monthly).map(Number).at(-1)).toBe(2070);
    expect(projection.cumulative[2070]).toBeGreaterThan(projection.cumulative[2069]);
  });

  test('default horizon remains age 95 for existing callers', () => {
    const projection = calculateProjection({
      pia: 2500,
      dob: '1965-06-15',
      filingYear: 67,
      inflationRate: 0.025,
      asOfDate: new Date(2026, 7, 31)
    });
    expect(Object.keys(projection.monthly).map(Number).at(-1)).toBe(2060);
  });
});
