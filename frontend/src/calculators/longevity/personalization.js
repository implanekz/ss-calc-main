import { getSsaQx } from './artifacts';
import { hazardToQx } from './hazardMath';

export const PERSONALIZED_SOURCE_DISCLOSURE = (modelVersion) =>
  `SSA 2023 period life table, personalized with a U.S. NHIS Linked Mortality model, version ${modelVersion}. Uses 2023 mortality rates without projected future improvement.`;

export const DEVELOPMENT_PERSONALIZED_SOURCE_DISCLOSURE = (modelVersion) =>
  `SSA 2023 period life table, adjusted with a development U.S. NHIS Linked Mortality model, version ${modelVersion}. This v1 missed the calibration-slope validation gate and is not an official SSA estimate. Uses 2023 mortality rates without projected future improvement.`;

export const isDevelopmentNhisArtifact = (artifact) =>
  artifact?.validation?.gates?.passed === false;

export class MortalityModelError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'MortalityModelError';
    this.cause = cause;
  }
}

const PROFILE_FIELDS = ['smoking', 'education', 'health'];
export const LONGEVITY_PROFILE_FIELD_LABELS = {
  smoking: 'smoking status',
  education: 'education',
  health: 'current health'
};
const REFERENCE = {
  smoking: 'never',
  education: 'college',
  health: 'excellent'
};
const AGE_BAND = (age) => (age >= 80 ? '80+' : age >= 70 ? '70-79' : '60-69');

export const unansweredLongevityFields = (profile) =>
  PROFILE_FIELDS.filter((field) => !(typeof profile?.[field] === 'string' && profile[field].length > 0));

export const isCompleteLongevityProfile = (profile) => unansweredLongevityFields(profile).length === 0;

const coefficient = (artifact, field, value) => {
  if (value === REFERENCE[field]) {
    return 0;
  }
  const stored = artifact?.coefficients?.[field]?.[value];
  if (!Number.isFinite(stored)) {
    throw new MortalityModelError(`Missing ${field} coefficient for ${value}`);
  }
  return stored;
};

export const validateNhisArtifact = (artifact) => {
  if (!artifact || artifact.schemaVersion !== 1 || artifact.artifactType !== 'nhis-linked-mortality-personalization') {
    throw new MortalityModelError('Unsupported or missing NHIS personalization artifact');
  }
  if (!artifact.modelVersion || !artifact.coefficients || !artifact.lambdaBySexAndAge) {
    throw new MortalityModelError('NHIS artifact is missing required fields');
  }
  ['smoking', 'education', 'health'].forEach((field) => {
    if (!artifact.coefficients[field] || typeof artifact.coefficients[field] !== 'object') {
      throw new MortalityModelError(`NHIS artifact is missing ${field} coefficients`);
    }
  });
  return artifact;
};

export const getRelativeHazard = (profile, artifact) => {
  validateNhisArtifact(artifact);
  if (!isCompleteLongevityProfile(profile)) {
    throw new MortalityModelError('Incomplete longevity profile cannot be scored');
  }
  const linear =
    coefficient(artifact, 'smoking', profile.smoking)
    + coefficient(artifact, 'education', profile.education)
    + coefficient(artifact, 'health', profile.health);
  return Math.exp(linear);
};

export const getCalibrationDistribution = (sex, age, artifact) => {
  validateNhisArtifact(artifact);
  const band = AGE_BAND(age);
  const cells = artifact.calibrationProfileDistributions?.[sex]?.[band];
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new MortalityModelError(`Missing calibration distribution for ${sex} ${band}`);
  }
  const weightSum = cells.reduce((sum, cell) => sum + Number(cell.weight), 0);
  if (Math.abs(weightSum - 1) > 1e-8) {
    throw new MortalityModelError(`Calibration weights for ${sex} ${band} are not normalized`);
  }
  return cells.map((cell) => ({
    weight: cell.weight,
    profile: cell.profile || {
      smoking: cell.smoking,
      education: cell.education,
      health: cell.health
    }
  }));
};

const lambdaFor = (artifact, sex, age) => {
  const lambda = artifact.lambdaBySexAndAge?.[sex]?.[String(age)]
    ?? artifact.lambdaBySexAndAge?.[sex]?.[age];
  if (!Number.isFinite(lambda) || lambda < 0) {
    throw new MortalityModelError(`Malformed lambda for ${sex} age ${age}`);
  }
  return lambda;
};

export const getAnnualQx = ({ sex, age, profile, modelArtifact }) => {
  if (age < 60 || !isCompleteLongevityProfile(profile) || !modelArtifact) {
    return getSsaQx(sex, age);
  }
  const artifact = validateNhisArtifact(modelArtifact);
  const relativeHazard = getRelativeHazard(profile, artifact);
  return hazardToQx(lambdaFor(artifact, sex, age) * relativeHazard);
};

export const solveLambda = (ssaQx, relativeHazards, weights) => {
  const target = (lambda) =>
    relativeHazards.reduce(
      (sum, hazard, index) => sum + weights[index] * (1 - Math.exp(-lambda * hazard)),
      0
    ) - ssaQx;

  let lo = 0;
  let hi = -Math.log(1 - Math.min(0.999999999, ssaQx)) * 100;
  if (target(hi) < 0) {
    hi *= 10;
  }
  for (let index = 0; index < 80; index += 1) {
    const mid = (lo + hi) / 2;
    if (target(mid) > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
};
