const WORKSHOP_PIA_KEY = 'ssCalc.workshopPia';

const empty = () => ({ spouse1: null, spouse2: null });

export function projectedThroughYear(earningsHistory = []) {
  const years = earningsHistory
    .filter((row) => row.is_projected || row.isProjected)
    .map((row) => row.year);
  return years.length ? Math.max(...years) : null;
}

export function readWorkshopPia() {
  if (typeof localStorage === 'undefined') return empty();
  try {
    return {
      ...empty(),
      ...JSON.parse(localStorage.getItem(WORKSHOP_PIA_KEY) || '{}')
    };
  } catch {
    return empty();
  }
}

export function stashWorkshopPia(person, adoption) {
  if (typeof localStorage === 'undefined') return;
  if (person !== 'spouse1' && person !== 'spouse2') return;
  const current = readWorkshopPia();
  current[person] = adoption
    ? {
        pia: adoption.pia,
        throughYear: adoption.throughYear ?? null,
        enabled: Boolean(adoption.enabled)
      }
    : null;
  localStorage.setItem(WORKSHOP_PIA_KEY, JSON.stringify(current));
}

export function disableWorkshopPia(person) {
  const current = readWorkshopPia()[person];
  if (!current) return;
  stashWorkshopPia(person, { ...current, enabled: false });
}
