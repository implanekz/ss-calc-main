export const parseLocalIsoDate = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const startOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const daysBetween = (start, end) => {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86400000);
};

export const birthdayAtAge = (birthDate, age) => {
  const birth = typeof birthDate === 'string' ? parseLocalIsoDate(birthDate) : birthDate;
  return new Date(birth.getFullYear() + age, birth.getMonth(), birth.getDate());
};

export const yearEndDate = (year) => new Date(year, 11, 31);

export const attainedWholeAge = (birthDate, asOfDate) => {
  const birth = typeof birthDate === 'string' ? parseLocalIsoDate(birthDate) : birthDate;
  const asOf = startOfLocalDay(asOfDate);
  let age = asOf.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(asOf.getFullYear(), birth.getMonth(), birth.getDate());
  if (asOf < birthdayThisYear) {
    age -= 1;
  }
  return age;
};
