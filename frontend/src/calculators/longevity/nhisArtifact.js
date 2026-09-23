import nhisPersonalizationV1 from '../../data/mortality/nhis-personalization-v1.json';
import { validateNhisArtifact } from './personalization';

// Development 1997–2009 fit from Task 4. Temporal-validation gates failed
// (calibration slope ~1.26–1.29). Disclosure must stay honest: this is not an
// official SSA estimate.
const PRODUCTION_NHIS_ARTIFACT = nhisPersonalizationV1;

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
