import { buildLongevitySummary } from './summary';
import { buildLifeExpectancyPresentation } from './presentation';
import { formatNamesAndAges } from '../../components/OurLifelongTimeline/longevityTimelineMath';
import { fixedAsOfDate, ted, tedAndMary } from './fixtures';
import { buildTestNhissArtifact } from './testNhissArtifact';

const completeProfile = { smoking: 'never', education: 'college', health: 'good' };
const currentSmokerProfile = { smoking: 'current', education: 'college', health: 'good' };

describe('life expectancy presentation', () => {
  test('individual cards use whole-age thresholds and at-least wording', () => {
    const summary = buildLongevitySummary({ people: [ted], asOfDate: fixedAsOfDate });
    const model = buildLifeExpectancyPresentation(summary);
    expect(model.cards.map((card) => card.probability)).toEqual([75, 50, 25]);
    expect(model.cards[1].tooltip).toContain('live to at least age');
  });

  test('cards treat the percentage as the primary metric and keep age or year in the same band', () => {
    const individual = buildLifeExpectancyPresentation(
      buildLongevitySummary({ people: [ted], asOfDate: fixedAsOfDate })
    );
    expect(individual.cards[0].primaryMetric).toBe('75%');
    expect(individual.cards[0].secondaryMetric).toMatch(/^age \d+/);
    expect(individual.cards[0].kicker).toMatch(/live to at least/i);

    const couple = buildLifeExpectancyPresentation(
      buildLongevitySummary({ people: tedAndMary, asOfDate: fixedAsOfDate })
    );
    expect(couple.cards[0].primaryMetric).toBe('75%');
    expect(couple.cards[0].secondaryMetric).toBe(String(couple.cards[0].year));
    expect(couple.cards[0].kicker).toMatch(/at least one of you is alive/i);
    expect(couple.cards[0].namesAndAges).toMatch(/Ted/);
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

  test('couple cards use household years, names, and at-least-one wording', () => {
    const summary = buildLongevitySummary({ people: tedAndMary, asOfDate: fixedAsOfDate });
    const model = buildLifeExpectancyPresentation(summary);
    expect(model.cards.map((card) => card.probability)).toEqual([75, 50, 25]);
    expect(model.cards[1].year).toBe(summary.household.thresholds[50]);
    expect(model.cards[1].tooltip).toContain('at least one of you will be alive in');
    expect(model.cards[1].namesAndAges).toMatch(/Ted/);
    expect(model.cards[1].namesAndAges).toMatch(/Mary/);
    expect(model.householdExplanation).toContain('live to at least age');
    expect(model.householdExplanation).toContain(String(summary.household.thresholds[50]));
    expect(model.householdExplanation).not.toMatch(/multiplicative/i);
  });

  test('household names, ages, and year labels use slider ages instead of onboarding DOB ages', () => {
    const people = [
      { ...tedAndMary[0], currentAge: 73 },
      { ...tedAndMary[1], currentAge: 70 }
    ];
    const summary = buildLongevitySummary({ people, asOfDate: fixedAsOfDate });
    const model = buildLifeExpectancyPresentation(summary);
    const year = model.cards[1].year;
    const asOfYear = fixedAsOfDate.getFullYear();
    const tedAge = 73 + (year - asOfYear);
    const maryAge = 70 + (year - asOfYear);
    expect(model.householdExplanation).toContain('Ted age 73');
    expect(model.householdExplanation).toContain('Mary age 70');
    expect(model.householdExplanation).not.toMatch(/Ted age 61/);
    expect(model.cards[1].namesAndAges).toBe(
      formatNamesAndAges({ people: summary.individuals ? Object.values(summary.individuals) : people, year, asOfYear })
    );
    expect(model.cards[1].namesAndAges).toBe(
      `Ted would be ${tedAge}, and Mary would be ${maryAge}.`
    );
    expect(model.chartRows[0][`${people[0].personId}Age`]).toBe(73);
    expect(model.cards.map((card) => card.year)).toEqual([
      summary.household.thresholds[75],
      summary.household.thresholds[50],
      summary.household.thresholds[25]
    ]);
  });

  test('a complete couple with no model stays labeled SSA and lists no unanswered fields', () => {
    const people = tedAndMary.map((person) => ({ ...person, profile: completeProfile }));
    const model = buildLifeExpectancyPresentation(
      buildLongevitySummary({ people, asOfDate: fixedAsOfDate })
    );
    expect(model.estimateLabel).toBe('SSA population estimate');
    expect(model.unansweredHint).toBeNull();
    expect(model.modelPendingNote).toMatch(/until the NHIS model is released/i);
  });

  test('incomplete health answers name what is still unanswered', () => {
    const people = [
      { ...tedAndMary[0], profile: { smoking: 'current', education: 'college', health: null } },
      { ...tedAndMary[1], profile: { smoking: 'current', education: null, health: null } }
    ];
    const model = buildLifeExpectancyPresentation(
      buildLongevitySummary({ people, asOfDate: fixedAsOfDate })
    );
    expect(model.estimateLabel).toBe('SSA population estimate');
    expect(model.unansweredHint).toMatch(/Ted/i);
    expect(model.unansweredHint).toMatch(/current health/i);
    expect(model.unansweredHint).toMatch(/Mary/i);
    expect(model.unansweredHint).toMatch(/education/i);
    expect(model.modelPendingNote).toBeNull();
  });

  test('personalized current-smoker vs never-smoker changes 50% ages and chart series', () => {
    const artifact = buildTestNhissArtifact();
    const neverSummary = buildLongevitySummary({
      people: [{ ...ted, profile: completeProfile }],
      asOfDate: fixedAsOfDate,
      modelArtifact: artifact
    });
    const currentSummary = buildLongevitySummary({
      people: [{ ...ted, profile: currentSmokerProfile }],
      asOfDate: fixedAsOfDate,
      modelArtifact: artifact
    });
    expect(neverSummary.individuals.ted.estimateType).toBe('personalized');
    expect(currentSummary.individuals.ted.estimateType).toBe('personalized');
    expect(currentSummary.individuals.ted.thresholds[50])
      .toBeLessThan(neverSummary.individuals.ted.thresholds[50]);

    const neverModel = buildLifeExpectancyPresentation(neverSummary);
    const currentModel = buildLifeExpectancyPresentation(currentSummary);
    expect(neverModel.estimateLabel).toBe('Personalized estimate');
    const comparisonAge = neverSummary.individuals.ted.thresholds[50];
    const neverPoint = neverModel.chartRows.find((row) => row.age === comparisonAge);
    const currentPoint = currentModel.chartRows.find((row) => row.age === comparisonAge);
    expect(currentPoint.survival).toBeLessThan(neverPoint.survival);
  });
});
