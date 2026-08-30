import { projectedThroughYear, readWorkshopPia, stashWorkshopPia, disableWorkshopPia } from './workshopPia';

describe('projectedThroughYear', () => {
  it('returns the latest projected year', () => {
    expect(projectedThroughYear([
      { year: 2024, is_projected: false },
      { year: 2026, is_projected: true },
      { year: 2028, isProjected: true }
    ])).toBe(2028);
  });

  it('returns null when nothing is projected', () => {
    expect(projectedThroughYear([{ year: 2024, is_projected: false }])).toBeNull();
  });
});

describe('workshop PIA stash', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips an adopted PIA', () => {
    stashWorkshopPia('spouse1', { pia: 2140, throughYear: 2025, enabled: true });
    expect(readWorkshopPia().spouse1).toEqual({
      pia: 2140,
      throughYear: 2025,
      enabled: true
    });
  });

  it('can disable without forgetting the last number', () => {
    stashWorkshopPia('spouse1', { pia: 2140, throughYear: 2025, enabled: true });
    disableWorkshopPia('spouse1');
    expect(readWorkshopPia().spouse1.enabled).toBe(false);
    expect(readWorkshopPia().spouse1.pia).toBe(2140);
  });

  it('ignores unknown person keys', () => {
    stashWorkshopPia('cousin', { pia: 1, enabled: true });
    expect(readWorkshopPia()).toEqual({ spouse1: null, spouse2: null });
  });
});
