import { migrateLifeExpectancyPreferences } from './preferences';

describe('life expectancy preference migration', () => {
  test('migrates legacy slots only when person identity is unambiguous', () => {
    const migrated = migrateLifeExpectancyPreferences({
      saved: {
        myGender: 'male',
        myHealth: { smoking: 'never', education: 'college', health: 'good' },
        spGender: 'female',
        spHealth: { smoking: 'former', education: 'some', health: 'fair' }
      },
      primaryPersonId: 'profile-1',
      partnerPersonId: 'partner-1'
    });
    expect(migrated.profilesByPersonId['profile-1'].sex).toBe('male');
    expect(migrated.profilesByPersonId['partner-1'].sex).toBe('female');
  });

  test('does not guess a partner mapping when no partner id exists', () => {
    const migrated = migrateLifeExpectancyPreferences({
      saved: { spGender: 'female', spHealth: { smoking: 'former', education: 'some', health: 'fair' } },
      primaryPersonId: 'profile-1',
      partnerPersonId: null
    });
    expect(Object.keys(migrated.profilesByPersonId)).toEqual([]);
  });

  test('keeps schema version 2 payloads unchanged', () => {
    const saved = {
      schemaVersion: 2,
      calcType: 'couple',
      profilesByPersonId: { 'profile-1': { sex: 'male', smoking: null, education: null, health: null } }
    };
    expect(migrateLifeExpectancyPreferences({
      saved,
      primaryPersonId: 'other',
      partnerPersonId: 'partner-1'
    })).toEqual(saved);
  });
});
