import { validateNhisArtifact } from './personalization';

// Production NHIS coefficients are not committed until temporal validation
// passes. When modeling/longevity/nhis-v1 exports
// frontend/src/data/mortality/nhis-personalization-v1.json, import that JSON
// here and assign it to PRODUCTION_NHIS_ARTIFACT. Do not substitute synthetic
// test coefficients in production.
const PRODUCTION_NHIS_ARTIFACT = null;

export const getProductionNhisArtifact = () => {
  if (!PRODUCTION_NHIS_ARTIFACT) {
    return null;
  }
  try {
    return validateNhisArtifact(PRODUCTION_NHIS_ARTIFACT);
  } catch {
    return null;
  }
};
