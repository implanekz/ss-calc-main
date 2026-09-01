export const resolveBirthDate = (record) => {
  if (!record) {
    return null;
  }
  return record.date_of_birth || record.dateOfBirth || record.birthDate || null;
};

export const resolveFirstName = (record, fallback) => {
  const name = record?.first_name || record?.firstName || record?.name;
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }
  return fallback;
};

export const resolvePersonId = (record, fallbackId) => record?.id || fallbackId || null;

export const hasPartnerBirthDate = (partners) => Boolean(resolveBirthDate(partners?.[0]));
