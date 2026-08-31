export const migrateLifeExpectancyPreferences = ({
  saved,
  primaryPersonId,
  partnerPersonId
}) => {
  if (saved?.schemaVersion === 2 && saved.profilesByPersonId) {
    return {
      schemaVersion: 2,
      calcType: saved.calcType === 'couple' ? 'couple' : 'individual',
      profilesByPersonId: saved.profilesByPersonId
    };
  }

  const profilesByPersonId = {};
  const hasLegacyPrimary = Boolean(saved?.myGender || saved?.myHealth);
  const hasLegacyPartner = Boolean(saved?.spGender || saved?.spHealth);

  if (primaryPersonId && hasLegacyPrimary) {
    profilesByPersonId[primaryPersonId] = {
      sex: saved.myGender || null,
      smoking: saved.myHealth?.smoking ?? null,
      education: saved.myHealth?.education ?? null,
      health: saved.myHealth?.health ?? null
    };
  }

  if (partnerPersonId && hasLegacyPartner && hasLegacyPrimary) {
    profilesByPersonId[partnerPersonId] = {
      sex: saved.spGender || null,
      smoking: saved.spHealth?.smoking ?? null,
      education: saved.spHealth?.education ?? null,
      health: saved.spHealth?.health ?? null
    };
  }

  return {
    schemaVersion: 2,
    calcType: saved?.calcType === 'couple' ? 'couple' : 'individual',
    profilesByPersonId
  };
};

export const emptyLongevityProfile = () => ({
  sex: null,
  smoking: null,
  education: null,
  health: null
});
