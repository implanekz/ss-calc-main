import { calculateProjection, combineProjections, resolveProjectionEndYear } from '../../calculators/showMeTheMoney/projections';
import { getFra } from '../../utils/benefitFormulas';

export const ageToCalendarYear = (birthYear, age) => birthYear + age;

export const calendarYearToAge = (birthYear, year) => year - birthYear;

export const getAxisEndYear = ({ birthYears = [], longevitySummary } = {}) => {
  if (Number.isFinite(longevitySummary?.axisEndYear)) {
    return longevitySummary.axisEndYear;
  }
  const years = birthYears.filter((year) => Number.isFinite(year));
  if (years.length === 0) {
    return null;
  }
  return Math.max(...years) + 95;
};

// The two claiming-strategy extremes shown in the timeline cursor's tooltip, alongside the
// household's actual/preferred scenario (shown separately, not as a third fixed hypothetical --
// see buildFilingComparisonBoxes for the tooltip's left-to-right box order).
export const BUCKET_FILING_AGES = [62, 70];

export const getHouseholdBucket = ({
  filingAge,
  spouse1Pia,
  spouse1Dob,
  spouse2Pia,
  spouse2Dob,
  inflation,
  prematureDeath = false,
  deathYear,
  endYear,
  isMarried = Boolean(spouse2Dob)
}) => {
  const primaryProjection = calculateProjection({
    pia: spouse1Pia,
    dob: spouse1Dob,
    filingYear: filingAge,
    filingMonth: 0,
    inflationRate: inflation,
    endYear: resolveProjectionEndYear(spouse1Dob, endYear)
  });
  const spouseProjection = isMarried && spouse2Dob
    ? calculateProjection({
      pia: spouse2Pia,
      dob: spouse2Dob,
      filingYear: filingAge,
      filingMonth: 0,
      inflationRate: inflation,
      endYear: resolveProjectionEndYear(spouse2Dob, endYear)
    })
    : null;
  const combined = combineProjections({
    primaryProjection,
    spouseProjection,
    isMarried: Boolean(spouseProjection),
    prematureDeath,
    deathYear
  });

  // Derive startYear from the same birthYear values that calculateProjection() used for its dictionary keys.
  // This ensures the mask boundary always aligns with the actual calendar years in the .monthly/.cumulative dictionaries.
  const startYear = (
    spouseProjection
      ? Math.max(primaryProjection.birthYear, spouseProjection.birthYear)
      : primaryProjection.birthYear
  ) + filingAge;

  // combined.cumulative already correctly accounts for each spouse's own partial first
  // claiming year (calculateProjection discounts it, and combineProjections preserves that
  // discount rather than assuming a flat 12 months) -- reuse it instead of re-deriving via
  // monthly * 12, which would silently overcount by however many months short of a full year
  // the later-born spouse's own claim actually started in. Offsetting by whatever had already
  // accumulated just before startYear keeps this bucket's own "both must have reached this
  // age" masking intact.
  const preStartCumulative = combined.cumulative[startYear - 1] || 0;

  const monthly = {};
  const cumulative = {};

  Object.keys(combined.monthly)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((year) => {
      if (year < startYear) {
        monthly[year] = 0;
        cumulative[year] = 0;
        return;
      }
      monthly[year] = combined.monthly[year];
      cumulative[year] = (combined.cumulative[year] || 0) - preStartCumulative;
    });

  return { monthly, cumulative, startYear };
};

export const getHouseholdBuckets = ({
  spouse1Pia,
  spouse1Dob,
  spouse2Pia,
  spouse2Dob,
  inflation,
  prematureDeath = false,
  deathYear,
  endYear,
  isMarried = Boolean(spouse2Dob)
}) =>
  BUCKET_FILING_AGES.map((filingAge) => ({
    filingAge,
    ...getHouseholdBucket({
      filingAge,
      spouse1Pia,
      spouse1Dob,
      spouse2Pia,
      spouse2Dob,
      inflation,
      prematureDeath,
      deathYear,
      endYear,
      isMarried
    })
  }));

export const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);

export const getAnnualIncome = (monthlyValue) => monthlyValue * 12;

export const formatBucketValue = (bucket, year) => {
  if (year < bucket.startYear) {
    return { display: `starts ${bucket.startYear}`, muted: true };
  }
  return { display: formatCurrency(bucket.cumulative[year] ?? 0), muted: false };
};

export const getMilestonesForPerson = ({ label, dob, preferredYear }) => {
  const birthYear = new Date(dob).getFullYear();
  const fra = getFra(birthYear);

  const milestones = [
    { year: birthYear + 62, label: `${label} turns 62`, kind: 'age62' },
    { year: birthYear + fra.years, label: `${label} reaches full retirement age`, kind: 'fra' },
    { year: birthYear + 70, label: `${label} turns 70`, kind: 'age70' }
  ];

  const numericPreferredYear = Number(preferredYear);
  // A cleared input (`''`) coerces to 0 via Number(''), which would otherwise place a stray
  // "chosen filing age" milestone at the person's birth year. Skip the milestone entirely
  // when the value isn't a real, in-range filing age. Unlike an earlier version of this
  // function, a chosen filing age landing on the same year as another milestone is still
  // added -- CalendarPhaseBar stacks same-year markers rather than this function dropping one.
  if (Number.isFinite(numericPreferredYear) && numericPreferredYear >= 62) {
    const chosenFilingAgeYear = birthYear + numericPreferredYear;
    milestones.push({ year: chosenFilingAgeYear, label: `${label}'s chosen filing age`, kind: 'chosenFilingAge' });
  }

  return milestones.sort((a, b) => a.year - b.year);
};

export const isTimelineReachable = ({ spouse1Dob }) => Boolean(spouse1Dob);

const MILESTONE_DO_LINES = {
  age62: 'This is the earliest possible filing age — the smallest benefit this household could lock in.',
  fra: 'Filing here locks in your full, unreduced benefit — no early-claim penalty, no delayed-credit bonus.',
  chosenFilingAge: "This is the age you've chosen to file.",
  age70: "This is the last year waiting still grows the benefit — filing later than this doesn't add more."
};

export const buildNarrative = ({
  year,
  primaryLabel,
  primaryAge,
  spouseLabel,
  spouseAge,
  primaryMilestones,
  spouseMilestones = [],
  monthlyIncome,
  prematureDeath,
  deathYear
}) => {
  const feel = spouseLabel
    ? `${year}: ${primaryLabel} is ${primaryAge}, ${spouseLabel} is ${spouseAge}.`
    : `${year}: ${primaryLabel} is ${primaryAge}.`;
  const think = `${formatCurrency(monthlyIncome)}/month · ${formatCurrency(getAnnualIncome(monthlyIncome))}/year`;

  // Order matters: primary's milestones are checked first, so when both people land a
  // milestone on the same year, doLine is derived from the primary's entry (array order,
  // not a significance ranking -- see spec "Design > Narrative content").
  const matches = [...primaryMilestones, ...spouseMilestones].filter((m) => m.year === year);
  const milestoneNotes = matches.map((m) => m.label);
  const doLine = matches.length > 0 ? MILESTONE_DO_LINES[matches[0].kind] : undefined;

  const survivorNote =
    prematureDeath && year >= deathYear
      ? 'This reflects survivor benefits — the household now receives the larger of the two benefits.'
      : undefined;

  return { feel, milestoneNotes, think, doLine, survivorNote };
};

export const buildFilingComparisonBoxes = ({ buckets, year, think, cumulativeIncome, couple = true }) => {
  const [bucket62, bucket70] = buckets;
  const age70Label = couple ? 'If both filed at 70' : 'If you filed at 70';
  const age62Label = couple ? 'If both filed at 62' : 'If you filed at 62';

  const bucketBox = (bucket, label) => {
    const { display: cumulativeDisplay, muted } = formatBucketValue(bucket, year);
    if (muted) {
      return { label, bigText: cumulativeDisplay, smallText: null, muted: true };
    }
    const monthly = bucket.monthly[year] ?? 0;
    return {
      label,
      bigText: `${formatCurrency(monthly)}/month · ${formatCurrency(getAnnualIncome(monthly))}/year`,
      smallText: cumulativeDisplay,
      muted: false
    };
  };

  return [
    bucketBox(bucket70, age70Label),
    bucketBox(bucket62, age62Label),
    { label: 'Your Plan', bigText: think, smallText: formatCurrency(cumulativeIncome), muted: false }
  ];
};
