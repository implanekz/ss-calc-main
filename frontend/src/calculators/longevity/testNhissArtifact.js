import { getSsaQx } from './artifacts';
import { solveLambda } from './personalization';

const SMOKING = ['never', 'former', 'current'];
const EDUCATION = ['college', 'some', 'high_school'];
const HEALTH = ['excellent', 'good', 'fair'];

export const testNhissCoefficients = {
  smoking: { former: 0.2, current: 0.5 },
  education: { some: 0.1, high_school: 0.3 },
  health: { good: 0.15, fair: 0.4 }
};

const relativeHazard = (profile) => Math.exp(
  (testNhissCoefficients.smoking[profile.smoking] || 0)
  + (testNhissCoefficients.education[profile.education] || 0)
  + (testNhissCoefficients.health[profile.health] || 0)
);

const cells = () => {
  const profiles = [];
  SMOKING.forEach((smoking) => {
    EDUCATION.forEach((education) => {
      HEALTH.forEach((health) => {
        profiles.push({ smoking, education, health });
      });
    });
  });
  const weight = 1 / profiles.length;
  return profiles.map((profile) => ({ weight, profile }));
};

export const buildTestNhissArtifact = () => {
  const distribution = cells();
  const hazards = distribution.map((cell) => relativeHazard(cell.profile));
  const weights = distribution.map((cell) => cell.weight);
  const bands = {
    '60-69': distribution,
    '70-79': distribution,
    '80+': distribution
  };
  const lambdaBySexAndAge = { male: {}, female: {} };
  ['male', 'female'].forEach((sex) => {
    for (let age = 60; age <= 119; age += 1) {
      lambdaBySexAndAge[sex][age] = solveLambda(getSsaQx(sex, age), hazards, weights);
    }
  });

  return {
    schemaVersion: 1,
    artifactType: 'nhis-linked-mortality-personalization',
    modelVersion: 'nhis-lmf-2019-v1-test',
    coefficients: testNhissCoefficients,
    calibrationProfileDistributions: {
      male: bands,
      female: bands
    },
    lambdaBySexAndAge
  };
};
