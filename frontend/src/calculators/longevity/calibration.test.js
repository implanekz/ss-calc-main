import { getSsaQx } from './artifacts';
import { getAnnualQx, getCalibrationDistribution } from './personalization';
import { buildTestNhissArtifact } from './testNhissArtifact';

const nhisArtifact = buildTestNhissArtifact();

describe('SSA calibration parity', () => {
  ['male', 'female'].forEach((sex) => {
    for (let age = 60; age <= 119; age += 1) {
      test(`${sex} age ${age} profiles reproduce SSA qx`, () => {
        const distribution = getCalibrationDistribution(sex, age, nhisArtifact);
        const meanQx = distribution.reduce(
          (sum, cell) => sum + cell.weight * getAnnualQx({
            sex,
            age,
            profile: cell.profile,
            modelArtifact: nhisArtifact
          }),
          0
        );
        expect(Math.abs(meanQx - getSsaQx(sex, age))).toBeLessThanOrEqual(1e-10);
      });
    }
  });
});
