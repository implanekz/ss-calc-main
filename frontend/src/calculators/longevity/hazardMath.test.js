import { hazardToQx, qxToHazard, survivalForFraction } from './hazardMath';

describe('hazard transformations', () => {
  test('qx and hazard transformations round trip', () => {
    [0.0001, 0.01, 0.25, 0.9].forEach((qx) => {
      expect(hazardToQx(qxToHazard(qx))).toBeCloseTo(qx, 14);
    });
  });

  test('a full year of constant hazard matches one minus qx', () => {
    const qx = 0.016455;
    expect(survivalForFraction(qx, 1)).toBeCloseTo(1 - qx, 14);
  });
});
