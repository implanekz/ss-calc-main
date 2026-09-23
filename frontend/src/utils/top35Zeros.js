/**
 * Count zero years inside the actual top 35 by value.
 * Do not use 35 - nonZeroYears — that assumes every missing year is a zero
 * in the top 35, which is false once padding / projection / a long career
 * have run.
 */
export const countZerosInTop35 = (rows = []) => {
  const banked = (rows || []).filter((row) => !row.isProjected && !row.is_projected);
  const sorted = [...banked].sort((a, b) => (Number(b.earnings) || 0) - (Number(a.earnings) || 0));
  const top35 = sorted.slice(0, 35);
  while (top35.length < 35) {
    top35.push({ earnings: 0 });
  }
  return top35.filter((row) => !(Number(row.earnings) > 0)).length;
};
