import { getSsaQx } from './artifacts';
import { fixedAsOfDate, ted } from './fixtures';
import { getAnnualQx, getRelativeHazard, isCompleteLongevityProfile } from './personalization';
import { buildLongevitySummary } from './summary';
import { buildTestNhissArtifact, testNhissCoefficients } from './testNhissArtifact';

const completeTedProfile = {
  smoking: 'never',
  education: 'college',
  health: 'good'
};

const nhisArtifact = buildTestNhissArtifact();

describe('longevity personalization', () => {
  test('incomplete profiles use the exact SSA probability', () => {
    expect(getAnnualQx({
      sex: 'male',
      age: 70,
      profile: { smoking: 'never', education: null, health: 'good' },
      modelArtifact: nhisArtifact
    })).toBe(getSsaQx('male', 70));
  });

  test('ages below 60 stay on the SSA probability even with a complete profile', () => {
    expect(getAnnualQx({
      sex: 'male',
      age: 59,
      profile: completeTedProfile,
      modelArtifact: nhisArtifact
    })).toBe(getSsaQx('male', 59));
  });

  test('all three predictors are scored in one linear predictor', () => {
    const profile = { smoking: 'current', education: 'high_school', health: 'fair' };
    const expected = Math.exp(
      testNhissCoefficients.smoking.current
      + testNhissCoefficients.education.high_school
      + testNhissCoefficients.health.fair
    );
    expect(getRelativeHazard(profile, nhisArtifact)).toBeCloseTo(expected, 14);
  });

  test('isCompleteLongevityProfile requires smoking, education, and health', () => {
    expect(isCompleteLongevityProfile(completeTedProfile)).toBe(true);
    expect(isCompleteLongevityProfile({ ...completeTedProfile, health: null })).toBe(false);
  });

  test('complete profiles stay on SSA until a model artifact is provided', () => {
    const withoutModel = buildLongevitySummary({
      people: [{ ...ted, profile: completeTedProfile }],
      asOfDate: fixedAsOfDate
    });
    const withModel = buildLongevitySummary({
      people: [{ ...ted, profile: completeTedProfile }],
      asOfDate: fixedAsOfDate,
      modelArtifact: nhisArtifact
    });
    expect(withoutModel.individuals.ted.estimateType).toBe('ssa-population');
    expect(withModel.individuals.ted.estimateType).toBe('personalized');
    expect(withModel.individuals.ted.thresholds[50]).not.toBe(
      withoutModel.individuals.ted.thresholds[50]
    );
  });

  test('complete current-smoker vs never-smoker changes 50% ages when a model artifact is provided', () => {
    const neverSmoker = buildLongevitySummary({
      people: [{ ...ted, profile: completeTedProfile }],
      asOfDate: fixedAsOfDate,
      modelArtifact: nhisArtifact
    });
    const currentSmoker = buildLongevitySummary({
      people: [{ ...ted, profile: { ...completeTedProfile, smoking: 'current' } }],
      asOfDate: fixedAsOfDate,
      modelArtifact: nhisArtifact
    });
    expect(currentSmoker.individuals.ted.thresholds[50])
      .toBeLessThan(neverSmoker.individuals.ted.thresholds[50]);
    const midAge = neverSmoker.individuals.ted.thresholds[50];
    const neverSurvival = neverSmoker.individuals.ted.curve.find((point) => point.age === midAge).survival;
    const currentSurvival = currentSmoker.individuals.ted.curve.find((point) => point.age === midAge).survival;
    expect(currentSurvival).toBeLessThan(neverSurvival);
  });

  test('a malformed model degrades the summary to SSA and emits a diagnostic', () => {
    const onDiagnostic = jest.fn();
    const artifactMissingHealthCoefficient = JSON.parse(JSON.stringify(nhisArtifact));
    delete artifactMissingHealthCoefficient.coefficients.health.good;
    const summary = buildLongevitySummary({
      people: [{ ...ted, profile: completeTedProfile }],
      asOfDate: fixedAsOfDate,
      modelArtifact: artifactMissingHealthCoefficient,
      onDiagnostic
    });
    expect(summary.individuals.ted.estimateType).toBe('ssa-population');
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      code: 'INVALID_MORTALITY_MODEL'
    }));
  });
});
