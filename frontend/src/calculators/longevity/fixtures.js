export const fixedAsOfDate = new Date(2026, 7, 31);
export const ted = {
  personId: 'ted',
  name: 'Ted',
  sex: 'male',
  birthDate: '1965-06-15',
  profile: null
};
export const mary = {
  personId: 'mary',
  name: 'Mary',
  sex: 'female',
  birthDate: '1970-02-10',
  profile: null
};
export const tedAndMary = [ted, mary];
export const tedProjectionInputs = {
  pia: 2500,
  dob: ted.birthDate,
  filingYear: 67,
  inflationRate: 0.025
};
export const maryProjectionInputs = {
  pia: 2000,
  dob: mary.birthDate,
  filingYear: 67,
  inflationRate: 0.025
};
