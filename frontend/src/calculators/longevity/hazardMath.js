export const qxToHazard = (qx) => -Math.log(1 - qx);

export const hazardToQx = (hazard) => 1 - Math.exp(-hazard);

export const survivalForFraction = (qx, fraction) =>
  Math.exp(-qxToHazard(qx) * fraction);
