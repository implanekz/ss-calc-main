// The scenario is the complete set of inputs that determine what the chart shows.
// It is serializable, versioned, and deliberately excludes view state (chart
// dimensions, modal flags, playback position, drag flags).

export const SCENARIO_SCHEMA_VERSION = 1;

export const PROVENANCE = {
  ESTIMATED: 'estimated',
  VERIFIED: 'verified'
};

// Defaults mirror the values previously hardcoded in ShowMeTheMoneyCalculator's
// useState initializers, so behavior is unchanged by the extraction.
const DEFAULTS = {
  isMarried: false,

  spouse1Dob: '1965-02-03',
  spouse1Pia: '',
  spouse1PreferredYear: 67,
  spouse1PreferredMonth: 0,
  spouse1AlreadyFiled: false,
  spouse1CurrentBenefit: null,
  spouse1FiledAge: 65,

  spouse2Dob: '1965-06-18',
  spouse2Pia: '',
  spouse2PreferredYear: 65,
  spouse2PreferredMonth: 0,
  spouse2AlreadyFiled: false,
  spouse2CurrentBenefit: null,
  spouse2FiledAge: 65,

  inflation: 0.025,
  prematureDeath: false,
  deathAge: 75,
  piaStrategy: 'late',

  goGoEndAge: 75,
  slowGoEndAge: 85,
  spouseGoGoEndAge: 75,
  spouseSlowGoEndAge: 85,

  monthlyNeeds: 7000,
  flowAge: 70,
  bubbleAge: 70
};

export const SCENARIO_FIELDS = Object.keys(DEFAULTS);

const pickKnownFields = (source = {}) =>
  SCENARIO_FIELDS.reduce((acc, field) => {
    if (source[field] !== undefined) acc[field] = source[field];
    return acc;
  }, {});

export const createScenario = (overrides = {}, assumptions = {}) => {
  const fields = { ...DEFAULTS, ...pickKnownFields(overrides) };
  return {
    ...fields,
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    provenance: PROVENANCE.ESTIMATED,
    earnings: { spouse1: null, spouse2: null },
    derivedPia: { spouse1: null, spouse2: null },
    piaSource: { spouse1: 'profile', spouse2: 'profile' },
    assumptions: {
      // Frozen at creation so a saved plan keeps reporting the tables it was
      // computed under, even after those tables are updated for a new year.
      bendPointsYear: assumptions.bendPointsYear ?? new Date().getFullYear(),
      colaRate: assumptions.colaRate ?? fields.inflation
    }
  };
};

const deriveProvenance = (earnings) =>
  earnings.spouse1 || earnings.spouse2 ? PROVENANCE.VERIFIED : PROVENANCE.ESTIMATED;

export const scenarioReducer = (state, action) => {
  switch (action.type) {
    case 'SET_FIELD': {
      if (!SCENARIO_FIELDS.includes(action.field)) return state;
      if (state[action.field] === action.value) return state;
      return { ...state, [action.field]: action.value };
    }
    case 'SET_EARNINGS': {
      if (action.person !== 'spouse1' && action.person !== 'spouse2') return state;
      const earnings = { ...state.earnings, [action.person]: action.record ?? null };
      const hasRecord = Boolean(action.record);
      return {
        ...state,
        earnings,
        provenance: deriveProvenance(earnings),
        piaSource: {
          ...state.piaSource,
          [action.person]: hasRecord ? 'earnings' : 'profile'
        },
        derivedPia: hasRecord
          ? state.derivedPia
          : { ...state.derivedPia, [action.person]: null }
      };
    }
    case 'SET_DERIVED_PIA': {
      if (action.person !== 'spouse1' && action.person !== 'spouse2') return state;
      if (state.derivedPia[action.person] === action.pia) return state;
      return {
        ...state,
        derivedPia: { ...state.derivedPia, [action.person]: action.pia }
      };
    }
    case 'SET_PIA_SOURCE': {
      if (action.person !== 'spouse1' && action.person !== 'spouse2') return state;
      if (action.source !== 'profile' && action.source !== 'earnings') return state;
      if (state.piaSource[action.person] === action.source) return state;
      return {
        ...state,
        piaSource: { ...state.piaSource, [action.person]: action.source }
      };
    }
    case 'RESTORE_META': {
      // Restores only the recorded metadata of a saved plan: the frozen
      // assumption set and the schema it was written under. Deliberately
      // narrower than LOAD, which would also overwrite PIA/DOB/married/
      // preferred ages -- those are owned by the profile sync, not by storage.
      const next = { ...state };
      if (action.assumptions) next.assumptions = { ...action.assumptions };
      if (action.schemaVersion !== undefined) next.schemaVersion = action.schemaVersion;
      return next;
    }
    case 'LOAD':
      return action.scenario;
    case 'RESET':
      return createScenario(action.overrides, action.assumptions);
    default:
      return state;
  }
};

// `earnings` is deliberately NOT serialized. The records live in the
// `earnings_records` table and are re-fetched on mount; writing them here
// duplicated every user's year-by-year financial history into
// calculator_preferences on each autosave, with no reader. `provenance` is
// derived from `earnings`, so persisting it would let a payload claim VERIFIED
// with no record behind it.
export const serializeScenario = (scenario) => ({
  ...pickKnownFields(scenario),
  schemaVersion: scenario.schemaVersion,
  assumptions: scenario.assumptions
});

export const deserializeScenario = (raw = {}) => {
  const base = createScenario(raw);
  return {
    ...base,
    schemaVersion: raw.schemaVersion ?? SCENARIO_SCHEMA_VERSION,
    // Earnings, and the provenance derived from them, always start empty: they
    // are authoritative only from earnings_records. A legacy payload that still
    // carries either is ignored rather than trusted.
    earnings: { spouse1: null, spouse2: null },
    derivedPia: { spouse1: null, spouse2: null },
    piaSource: { spouse1: 'profile', spouse2: 'profile' },
    provenance: PROVENANCE.ESTIMATED,
    // Recorded assumptions win over freshly-derived ones.
    assumptions: raw.assumptions ?? base.assumptions
  };
};

// True only when the record itself proves the person already has 35 non-zero
// earnings years -- i.e. zero years in the top 35 is zero, so working longer
// really cannot add a year to the top 35. Only actual (non-projected) years
// count; a projection is an assumption, not a year they have banked.
export const hasThirtyFiveNonZeroYears = (record) => {
  if (!record || !Array.isArray(record.rows)) return false;
  const banked = record.rows.filter(
    (row) => !row.isProjected && Number(row.earnings) > 0
  );
  return banked.length >= 35;
};

// UNRESOLVED — settle this before wiring the scenario-comparison chart.
// This reads the LIVE `inflation` field, but each scenario also carries a FROZEN
// `assumptions.colaRate` captured at creation. They diverge as soon as the COLA
// slider moves after a scenario exists (observed: inflation 0.04 alongside
// colaRate 0.025 in one persisted scenario). Nothing calls this yet, so it is
// latent — but once the chart ships, two scenarios saved under genuinely
// different COLA assumptions would compare as if they matched, producing exactly
// the dishonest lines the frozen-assumption design exists to prevent.
// Decide which value is authoritative (likely assumptions.colaRate), and
// consider refusing to compare when a scenario's live inflation has drifted from
// its own frozen colaRate — that drift means the saved plan no longer describes
// the assumptions it was computed under.
export const effectivePia = (scenario, person) => {
  const typed = person === 'spouse2' ? scenario.spouse2Pia : scenario.spouse1Pia;
  if (
    scenario.piaSource?.[person] === 'earnings' &&
    scenario.derivedPia?.[person] != null
  ) {
    return scenario.derivedPia[person];
  }
  return typed;
};

// Frozen colaRate is authoritative. Live inflation can drift after the slider
// moves; two plans are not comparable if either has drifted from its own freeze
// or if their frozen rates / bend-point years differ.
export const areScenariosComparable = (a, b) =>
  a.assumptions.bendPointsYear === b.assumptions.bendPointsYear &&
  a.assumptions.colaRate === b.assumptions.colaRate &&
  a.inflation === a.assumptions.colaRate &&
  b.inflation === b.assumptions.colaRate;

export const planLabel = (scenario) =>
  scenario.isMarried ? 'Our Lifelong Plan' : 'My Lifelong Plan';
