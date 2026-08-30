import {
  SCENARIO_SCHEMA_VERSION,
  PROVENANCE,
  SCENARIO_FIELDS,
  createScenario,
  scenarioReducer,
  serializeScenario,
  deserializeScenario,
  areScenariosComparable,
  hasThirtyFiveNonZeroYears,
  planLabel,
  effectivePia
} from './scenario';

describe('createScenario', () => {
  it('applies documented defaults', () => {
    const s = createScenario();
    expect(s.inflation).toBe(0.025);
    expect(s.spouse1PreferredYear).toBe(67);
    expect(s.spouse2PreferredYear).toBe(65);
    expect(s.monthlyNeeds).toBe(7000);
    expect(s.isMarried).toBe(false);
  });

  it('starts as an estimate with no earnings records', () => {
    const s = createScenario();
    expect(s.provenance).toBe(PROVENANCE.ESTIMATED);
    expect(s.earnings.spouse1).toBeNull();
    expect(s.earnings.spouse2).toBeNull();
  });

  it('freezes the assumption set at creation time', () => {
    const s = createScenario({ inflation: 0.03 }, { bendPointsYear: 2026 });
    expect(s.assumptions.bendPointsYear).toBe(2026);
    expect(s.assumptions.colaRate).toBe(0.03);
    expect(s.schemaVersion).toBe(SCENARIO_SCHEMA_VERSION);
  });

  it('accepts overrides for any declared field', () => {
    const s = createScenario({ spouse1Pia: 3000, isMarried: true });
    expect(s.spouse1Pia).toBe(3000);
    expect(s.isMarried).toBe(true);
  });

  it('ignores unknown keys so view state cannot leak in', () => {
    const s = createScenario({ svgHeight: 700, isPlaying: true });
    expect(s.svgHeight).toBeUndefined();
    expect(s.isPlaying).toBeUndefined();
  });
});

describe('SCENARIO_FIELDS', () => {
  it('contains every field the projection memo depends on', () => {
    [
      'isMarried', 'spouse1Dob', 'spouse1Pia', 'spouse1PreferredYear',
      'spouse1PreferredMonth', 'spouse2Dob', 'spouse2Pia',
      'spouse2PreferredYear', 'spouse2PreferredMonth', 'inflation',
      'prematureDeath', 'deathAge', 'piaStrategy'
    ].forEach((f) => expect(SCENARIO_FIELDS).toContain(f));
  });

  it('excludes view state', () => {
    ['svgHeight', 'isPlaying', 'chartView', 'sidebarCollapsed', 'showYearModal']
      .forEach((f) => expect(SCENARIO_FIELDS).not.toContain(f));
  });
});

describe('scenarioReducer', () => {
  it('sets a single field without disturbing others', () => {
    const s = createScenario({ spouse1Pia: 2000 });
    const next = scenarioReducer(s, { type: 'SET_FIELD', field: 'inflation', value: 0.03 });
    expect(next.inflation).toBe(0.03);
    expect(next.spouse1Pia).toBe(2000);
  });

  it('returns the same reference when the value is unchanged', () => {
    const s = createScenario({ inflation: 0.025 });
    const next = scenarioReducer(s, { type: 'SET_FIELD', field: 'inflation', value: 0.025 });
    expect(next).toBe(s);
  });

  it('rejects fields outside SCENARIO_FIELDS', () => {
    const s = createScenario();
    const next = scenarioReducer(s, { type: 'SET_FIELD', field: 'svgHeight', value: 900 });
    expect(next).toBe(s);
    expect(next.svgHeight).toBeUndefined();
  });

  it('attaches an earnings record and flips provenance to verified', () => {
    const s = createScenario();
    const record = { birthYear: 1965, rows: [{ year: 2020, earnings: 100000 }], pia: 3000 };
    const next = scenarioReducer(s, { type: 'SET_EARNINGS', person: 'spouse1', record });
    expect(next.earnings.spouse1).toEqual(record);
    expect(next.provenance).toBe(PROVENANCE.VERIFIED);
    expect(next.piaSource.spouse1).toBe('earnings');
  });

  it('stays estimated when an earnings record is cleared', () => {
    const s = scenarioReducer(createScenario(), {
      type: 'SET_EARNINGS', person: 'spouse1', record: { birthYear: 1965, rows: [], pia: 1 }
    });
    const next = scenarioReducer(s, { type: 'SET_EARNINGS', person: 'spouse1', record: null });
    expect(next.provenance).toBe(PROVENANCE.ESTIMATED);
    expect(next.piaSource.spouse1).toBe('profile');
    expect(next.derivedPia.spouse1).toBeNull();
  });

  it('stores a derived PIA without overwriting the typed field', () => {
    const s = createScenario({ spouse1Pia: 2800 });
    const next = scenarioReducer(s, { type: 'SET_DERIVED_PIA', person: 'spouse1', pia: 3414.93 });
    expect(next.derivedPia.spouse1).toBe(3414.93);
    expect(next.spouse1Pia).toBe(2800);
  });

  it('lets the user switch back to the typed PIA', () => {
    const withRecord = scenarioReducer(createScenario(), {
      type: 'SET_EARNINGS', person: 'spouse1', record: { birthYear: 1966, rows: [] }
    });
    const next = scenarioReducer(withRecord, { type: 'SET_PIA_SOURCE', person: 'spouse1', source: 'profile' });
    expect(next.piaSource.spouse1).toBe('profile');
  });

  it('replaces the whole scenario on LOAD', () => {
    const s = createScenario({ spouse1Pia: 1000 });
    const loaded = createScenario({ spouse1Pia: 4000, isMarried: true });
    expect(scenarioReducer(s, { type: 'LOAD', scenario: loaded }).spouse1Pia).toBe(4000);
  });

  it('restores a saved plan\'s frozen assumptions on RESTORE_META', () => {
    const s = createScenario({}, { bendPointsYear: 2030, colaRate: 0.05 });
    const next = scenarioReducer(s, {
      type: 'RESTORE_META',
      assumptions: { bendPointsYear: 2026, colaRate: 0.02 },
      schemaVersion: 1
    });
    expect(next.assumptions).toEqual({ bendPointsYear: 2026, colaRate: 0.02 });
    expect(next.schemaVersion).toBe(1);
  });

  it('leaves profile-owned fields untouched on RESTORE_META', () => {
    const s = createScenario({ spouse1Pia: 3200, spouse1Dob: '1962-01-01', isMarried: true });
    const next = scenarioReducer(s, {
      type: 'RESTORE_META',
      assumptions: { bendPointsYear: 2026, colaRate: 0.02 }
    });
    expect(next.spouse1Pia).toBe(3200);
    expect(next.spouse1Dob).toBe('1962-01-01');
    expect(next.isMarried).toBe(true);
    expect(next.spouse1PreferredYear).toBe(s.spouse1PreferredYear);
  });
});

describe('serialization', () => {
  it('round-trips the fields it persists without loss', () => {
    const s = createScenario({ spouse1Pia: 3000, isMarried: true, deathAge: 82 });
    expect(deserializeScenario(serializeScenario(s))).toEqual(s);
  });

  it('never writes the earnings history into the persisted payload', () => {
    const s = scenarioReducer(createScenario(), {
      type: 'SET_EARNINGS',
      person: 'spouse1',
      record: { birthYear: 1965, rows: [{ year: 2020, earnings: 100000 }] }
    });
    const payload = serializeScenario(s);
    expect(payload.earnings).toBeUndefined();
    expect(payload.provenance).toBeUndefined();
    expect(payload.workshopPia).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('100000');
  });

  it('deserializes to an empty earnings shape that is safe to read', () => {
    const restored = deserializeScenario({ schemaVersion: 1 });
    expect(restored.earnings).toEqual({ spouse1: null, spouse2: null });
    expect(restored.provenance).toBe(PROVENANCE.ESTIMATED);
  });

  it('will not claim verified from a legacy payload with no record behind it', () => {
    const restored = deserializeScenario({
      schemaVersion: 1,
      provenance: PROVENANCE.VERIFIED,
      earnings: { spouse1: { birthYear: 1965, rows: [] }, spouse2: null }
    });
    expect(restored.provenance).toBe(PROVENANCE.ESTIMATED);
    expect(restored.earnings.spouse1).toBeNull();
  });

  it('fills missing fields from defaults when reading an older payload', () => {
    const restored = deserializeScenario({ schemaVersion: 1, spouse1Pia: 2500 });
    expect(restored.spouse1Pia).toBe(2500);
    expect(restored.inflation).toBe(0.025);
  });

  it('preserves the recorded assumptions rather than reapplying current ones', () => {
    const restored = deserializeScenario({
      schemaVersion: 1,
      assumptions: { bendPointsYear: 2025, colaRate: 0.02 }
    });
    expect(restored.assumptions.bendPointsYear).toBe(2025);
  });
});

describe('hasThirtyFiveNonZeroYears', () => {
  const rows = (count, opts = {}) =>
    Array.from({ length: count }, (_, i) => ({
      year: 1990 + i,
      earnings: 50000,
      isProjected: false,
      ...opts
    }));

  it('is false with no record at all, so the reassurance cannot show', () => {
    expect(hasThirtyFiveNonZeroYears(null)).toBe(false);
    expect(hasThirtyFiveNonZeroYears({})).toBe(false);
  });

  it('is false when fewer than 35 years are banked', () => {
    expect(hasThirtyFiveNonZeroYears({ rows: rows(34) })).toBe(false);
  });

  it('is true at 35 banked non-zero years', () => {
    expect(hasThirtyFiveNonZeroYears({ rows: rows(35) })).toBe(true);
  });

  it('does not count zero-earnings years', () => {
    const record = { rows: [...rows(30), ...rows(10).map((r) => ({ ...r, earnings: 0 }))] };
    expect(hasThirtyFiveNonZeroYears(record)).toBe(false);
  });

  it('does not count projected years, which are assumptions rather than banked', () => {
    const record = { rows: [...rows(30), ...rows(10).map((r) => ({ ...r, isProjected: true }))] };
    expect(hasThirtyFiveNonZeroYears(record)).toBe(false);
  });
});

describe('effectivePia', () => {
  it('uses the typed PIA when there is no earnings-derived value', () => {
    const s = createScenario({ spouse1Pia: 2800 });
    expect(effectivePia(s, 'spouse1')).toBe(2800);
  });

  it('uses the derived PIA once it is adopted', () => {
    let s = createScenario({ spouse1Pia: 2800 });
    s = scenarioReducer(s, { type: 'SET_EARNINGS', person: 'spouse1', record: { birthYear: 1966, rows: [] } });
    s = scenarioReducer(s, { type: 'SET_DERIVED_PIA', person: 'spouse1', pia: 3414.93 });
    expect(effectivePia(s, 'spouse1')).toBe(3414.93);
  });

  it('falls back to the typed PIA after switch-back', () => {
    let s = createScenario({ spouse1Pia: 2800 });
    s = scenarioReducer(s, { type: 'SET_EARNINGS', person: 'spouse1', record: { birthYear: 1966, rows: [] } });
    s = scenarioReducer(s, { type: 'SET_DERIVED_PIA', person: 'spouse1', pia: 3414.93 });
    s = scenarioReducer(s, { type: 'SET_PIA_SOURCE', person: 'spouse1', source: 'profile' });
    expect(effectivePia(s, 'spouse1')).toBe(2800);
  });

  it('uses the PIA Calculator workshop number when adopted', () => {
    let s = createScenario({ spouse1Pia: 2500 });
    s = scenarioReducer(s, { type: 'SET_EARNINGS', person: 'spouse1', record: { birthYear: 1966, rows: [] } });
    s = scenarioReducer(s, { type: 'SET_DERIVED_PIA', person: 'spouse1', pia: 3182 });
    s = scenarioReducer(s, {
      type: 'SET_WORKSHOP_PIA',
      person: 'spouse1',
      pia: 2140,
      throughYear: 2025,
      enabled: true
    });
    expect(s.spouse1Pia).toBe(2500);
    expect(s.piaSource.spouse1).toBe('workshop');
    expect(effectivePia(s, 'spouse1')).toBe(2140);
  });

  it('returns to the typed PIA when the workshop adoption is cleared', () => {
    let s = createScenario({ spouse1Pia: 2500 });
    s = scenarioReducer(s, {
      type: 'SET_WORKSHOP_PIA',
      person: 'spouse1',
      pia: 2140,
      throughYear: 2025,
      enabled: true
    });
    s = scenarioReducer(s, { type: 'SET_WORKSHOP_PIA', person: 'spouse1', enabled: false });
    expect(s.piaSource.spouse1).toBe('profile');
    expect(s.workshopPia.spouse1).toBeNull();
    expect(effectivePia(s, 'spouse1')).toBe(2500);
  });

  it('does not let a later earnings fetch steal the workshop source', () => {
    let s = createScenario({ spouse1Pia: 2500 });
    s = scenarioReducer(s, {
      type: 'SET_WORKSHOP_PIA',
      person: 'spouse1',
      pia: 2140,
      enabled: true
    });
    s = scenarioReducer(s, {
      type: 'SET_EARNINGS',
      person: 'spouse1',
      record: { birthYear: 1966, rows: [] }
    });
    expect(s.piaSource.spouse1).toBe('workshop');
    expect(effectivePia(s, 'spouse1')).toBe(2140);
  });
});

describe('areScenariosComparable', () => {
  it('is true when assumptions match', () => {
    const a = createScenario({ spouse1PreferredYear: 62 }, { bendPointsYear: 2026 });
    const b = createScenario({ spouse1PreferredYear: 70 }, { bendPointsYear: 2026 });
    expect(areScenariosComparable(a, b)).toBe(true);
  });

  it('is false when frozen COLA differs, since the lines would not be comparable', () => {
    const a = createScenario({ inflation: 0.025 }, { bendPointsYear: 2026 });
    const b = createScenario({ inflation: 0.030 }, { bendPointsYear: 2026 });
    expect(areScenariosComparable(a, b)).toBe(false);
  });

  it('is false when live inflation has drifted from the frozen colaRate', () => {
    const a = createScenario({ inflation: 0.025 }, { bendPointsYear: 2026 });
    const drifted = scenarioReducer(a, { type: 'SET_FIELD', field: 'inflation', value: 0.04 });
    const b = createScenario({ inflation: 0.025 }, { bendPointsYear: 2026 });
    expect(areScenariosComparable(drifted, b)).toBe(false);
  });

  it('is false when bend point years differ', () => {
    const a = createScenario({}, { bendPointsYear: 2025 });
    const b = createScenario({}, { bendPointsYear: 2026 });
    expect(areScenariosComparable(a, b)).toBe(false);
  });
});

describe('planLabel', () => {
  it('is "My Lifelong Plan" when single', () => {
    expect(planLabel(createScenario({ isMarried: false }))).toBe('My Lifelong Plan');
  });

  it('is "Our Lifelong Plan" when married', () => {
    expect(planLabel(createScenario({ isMarried: true }))).toBe('Our Lifelong Plan');
  });
});
