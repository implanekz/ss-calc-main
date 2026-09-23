import { hasPartnerBirthDate, resolveBirthDate, resolveFirstName, resolvePersonId } from './identity';

describe('longevity identity', () => {
  test('reads date_of_birth or dateOfBirth after profile normalization', () => {
    expect(resolveBirthDate({ date_of_birth: '1965-06-15' })).toBe('1965-06-15');
    expect(resolveBirthDate({ dateOfBirth: '1965-06-15' })).toBe('1965-06-15');
    expect(resolveBirthDate({})).toBeNull();
    expect(resolveBirthDate(null)).toBeNull();
  });

  test('reads first_name or firstName', () => {
    expect(resolveFirstName({ first_name: 'Ted' }, 'You')).toBe('Ted');
    expect(resolveFirstName({ firstName: 'Mary' }, 'Spouse')).toBe('Mary');
    expect(resolveFirstName({}, 'You')).toBe('You');
  });

  test('uses a stable person id with a fallback', () => {
    expect(resolvePersonId({ id: 'profile-1' }, 'primary')).toBe('profile-1');
    expect(resolvePersonId({}, 'primary')).toBe('primary');
  });

  test('detects a partner date of birth in either field name', () => {
    expect(hasPartnerBirthDate([{ dateOfBirth: '1968-02-10' }])).toBe(true);
    expect(hasPartnerBirthDate([])).toBe(false);
  });
});
