# SSA Longevity Personalization and Timeline Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current CDC table and undocumented multipliers with a shared SSA 2023 plus NHIS longevity engine, then show consistent individual and household longevity flags in both the Life Expectancy module and Our Lifelong Timeline.

**Architecture:** A reproducible offline modeling pipeline produces two versioned runtime artifacts: the SSA period life table and the NHIS personalization model. Pure JavaScript modules load those artifacts and calculate individual and calendar-aligned household survival. React components only persist inputs, adapt engine outputs, and render cards, charts, timeline flags, disclosures, and accessible tooltips.

**Tech Stack:** React 18, Create React App, Jest, Chart.js, FastAPI, Supabase JSONB preferences, R 4.5 with `renv`, `survey`, `mice`, `haven`, `jsonlite`, `yaml`, and `digest`.

## Global Constraints

- Use the SSA 2023 period life table as the only absolute mortality baseline.
- Do not fetch SSA or NCHS data at application runtime.
- Treat the result as a period-table estimate using 2023 mortality rates without projected future mortality improvement.
- Estimate smoking, education, and self-rated health together in one NHIS model. Do not retain the current 27-cell multiplier table.
- Bind persisted longevity profiles to `profile.id` and `partner.id`, not positional `myHealth`, `spHealth`, `spouse1`, or `spouse2` keys.
- When date of birth and SSA-supported sex are available but personalization is incomplete, calculate an explicitly labeled SSA population estimate.
- Do not infer or remap a sex value unsupported by SSA's male/female table.
- Condition survival on an explicit `asOfDate`; tests must never depend on the wall clock.
- Individual flags use the greatest whole birthday age whose survival remains at or above 75%, 50%, or 25%.
- Household flags evaluate both people on December 31 of the same calendar year.
- An individual threshold beyond age 110 renders as `110+`; a household threshold beyond its shared cap renders as `Beyond {capYear}`.
- No production marker may contain an illustrative or hardcoded longevity age or year.
- Every displayed timeline year must have financial projection data.
- Use the exact approved tooltip copy from `docs/superpowers/specs/2026-08-31-ssa-longevity-timeline-design.md`.
- Keep the Go-Go/Slow-Go/No-Go bar and its drag handles on ages 62–95. Longevity flags and financial data may extend past 95; the phase bar itself does not.
- Do not execute any commit step below unless the user explicitly authorizes commits.

## File Structure

### Offline modeling and source verification

- Create `modeling/longevity/ssa/README.md`: SSA source, regeneration, checksum, and review procedure.
- Create `modeling/longevity/ssa/fetch_table4c6.py`: download or parse a supplied official SSA HTML snapshot.
- Create `modeling/longevity/ssa/fixtures/table4c6-2023.html`: committed official-page snapshot used by tests.
- Create `modeling/longevity/ssa/verify_artifact.py`: validate schema, checksum, ages, sexes, units, and official spot values.
- Create `modeling/longevity/ssa/tests/test_ssa_artifact.py`: parser and artifact regression tests.
- Create `modeling/longevity/nhis-v1/README.md`: cohort, variable, imputation, model, validation, and export procedure.
- Create `modeling/longevity/nhis-v1/renv.lock`: frozen R modeling dependencies.
- Create `modeling/longevity/nhis-v1/config/cohorts.yml`: development, temporal-validation, production-fit, and calibration-target cohorts.
- Create `modeling/longevity/nhis-v1/config/variable-map.yml`: year-specific NHIS and linked-mortality variable names mapped to canonical fields.
- Create `modeling/longevity/nhis-v1/R/`: download verification, Person/Sample Adult joining, harmonization, imputation, person-quarter expansion, model fitting, temporal validation, SSA calibration, and artifact export functions.
- Create `modeling/longevity/nhis-v1/run_pipeline.R`: deterministic pipeline entry point.
- Create `modeling/longevity/nhis-v1/tests/testthat/`: cohort, recoding, survival-row, calibration, and artifact-schema tests.
- Create `modeling/longevity/nhis-v1/validation/temporal-validation-v1.json`: committed release-gate evidence.

### Runtime data and engine

- Create `frontend/src/data/mortality/ssa-period-life-table-2023.json`: SSA ages 0–119 with metadata and checksum.
- Create `frontend/src/data/mortality/nhis-personalization-v1.json`: fitted coefficients, calibration hazards, mappings, and validation summary.
- Create `frontend/src/calculators/longevity/artifacts.js`: schema checks and artifact accessors.
- Create `frontend/src/calculators/longevity/dateMath.js`: birthday intervals, fractional exposure, and year-end dates.
- Create `frontend/src/calculators/longevity/hazardMath.js`: `qx` and hazard transformations.
- Create `frontend/src/calculators/longevity/personalization.js`: profile validation, relative hazard scoring, and calibrated `qx`.
- Create `frontend/src/calculators/longevity/individualSurvival.js`: curve and whole-age threshold calculations.
- Create `frontend/src/calculators/longevity/householdSurvival.js`: shared-date either-alive calculations.
- Create `frontend/src/calculators/longevity/summary.js`: one public summary consumed by both interfaces.
- Create `frontend/src/calculators/longevity/index.js`: public exports.
- Create colocated `*.test.js` files and `frontend/src/calculators/longevity/fixtures.js`.

### Persistence and presentation

- Modify `backend/api/preferences.py`: persist the `lifeExpectancy` calculator state.
- Create `frontend/src/calculators/longevity/preferences.js`: schema version 2, person-ID lookup, and legacy migration.
- Modify `frontend/src/components/LifeExpectancyCalculator.jsx`: consume household identity and the shared engine.
- Create `frontend/src/components/OurLifelongTimeline/LongevityFlagPopover.jsx`: accessible flag tooltip.
- Create `frontend/src/components/OurLifelongTimeline/HouseholdLongevityRow.jsx`: slim "At least one alive" row.
- Create `frontend/src/components/OurLifelongTimeline/longevityTimelineMath.js`: summary-to-marker mapping and tooltip copy.
- Modify `frontend/src/components/OurLifelongTimeline/CalendarPhaseBar.jsx`: longevity variants and popovers.
- Modify `frontend/src/components/OurLifelongTimeline/OurLifelongTimeline.jsx`: one- or two-person rows, household row, dynamic axis, disclosures.
- Modify `frontend/src/components/OurLifelongTimeline/timelineMath.js`: dynamic axis and single-person reachability.
- Modify `frontend/src/calculators/showMeTheMoney/projections.js`: explicit projection end year.
- Modify `frontend/src/components/ShowMeTheMoneyCalculator.jsx`: build one longevity summary before projections and pass it to the timeline.
- Modify `docs/DATA-LINEAGE.md` and `docs/MODELING-ASSUMPTIONS.md`: mortality source and horizon assumptions.
- Create `docs/MORTALITY-DATA-LINEAGE.md`: end-to-end source, model, calibration, and runtime lineage.

---

### Task 1: Build and verify the SSA 2023 runtime artifact

**Files:**
- Create: `modeling/longevity/ssa/README.md`
- Create: `modeling/longevity/ssa/fetch_table4c6.py`
- Create: `modeling/longevity/ssa/fixtures/table4c6-2023.html`
- Create: `modeling/longevity/ssa/verify_artifact.py`
- Create: `modeling/longevity/ssa/tests/test_ssa_artifact.py`
- Create: `frontend/src/data/mortality/ssa-period-life-table-2023.json`

**Interfaces:**
- Consumes: official SSA `table4c6.html` or the committed snapshot at `modeling/longevity/ssa/fixtures/table4c6-2023.html`. Tests must use the committed snapshot, not a live download.
- Produces: a JSON artifact with `schemaVersion`, provenance metadata, `checksumSha256`, and male/female rows for every age 0–119.

- [ ] **Step 1: Write parser and artifact-schema tests**

```python
def test_parse_table_returns_all_ages_for_both_sexes(ssa_html):
    artifact = parse_table(ssa_html, retrieved_at="2026-08-31")
    assert [row["age"] for row in artifact["data"]["male"]] == list(range(120))
    assert [row["age"] for row in artifact["data"]["female"]] == list(range(120))
    assert all(0 <= row["qx"] <= 1 for sex in ("male", "female") for row in artifact["data"][sex])


def test_checksum_covers_only_canonical_data_payload(ssa_html):
    first = parse_table(ssa_html, retrieved_at="2026-08-31")
    second = parse_table(ssa_html, retrieved_at="2026-09-01")
    assert first["checksumSha256"] == second["checksumSha256"]


def test_official_spot_values_match_source(ssa_html):
    artifact = parse_table(ssa_html, retrieved_at="2026-08-31")
    expected_qx = {
        "male": {0: 0.006015, 65: 0.016455, 95: 0.262268, 110: 0.597297, 119: 0.926604},
        "female": {0: 0.005125, 65: 0.010188, 95: 0.216846, 110: 0.597297, 119: 0.926604},
    }
    for sex, values in expected_qx.items():
        for age, qx in values.items():
            assert artifact["data"][sex][age]["qx"] == qx
```

- [ ] **Step 2: Run the tests and verify they fail because the parser is absent**

Run:

```bash
python -m pytest modeling/longevity/ssa/tests/test_ssa_artifact.py -q
```

Expected: import failure for `fetch_table4c6`.

- [ ] **Step 3: Implement deterministic parsing and canonical checksumming**

```python
def canonical_checksum(data):
    payload = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_artifact(rows, retrieved_at):
    data = {
        sex: [
            {"age": age, "qx": values["qx"], "lx": values["lx"], "ex": values["ex"]}
            for age, values in sorted(rows[sex].items())
        ]
        for sex in ("male", "female")
    }
    return {
        "schemaVersion": 1,
        "artifactType": "ssa-period-life-table",
        "sourceUrl": "https://www.ssa.gov/oact/STATS/table4c6.html",
        "mortalityYear": 2023,
        "trusteesReportYear": 2026,
        "retrievedAt": retrieved_at,
        "supportedAgeRange": [0, 119],
        "units": "one-year probability of death",
        "checksumSha256": canonical_checksum(data),
        "data": data,
    }
```

The parser must select the labeled male and female columns, convert published probabilities to decimal probabilities without rounding, and reject duplicate or missing ages.

- [ ] **Step 4: Generate the artifact from the official source and verify it**

Run:

```bash
python modeling/longevity/ssa/fetch_table4c6.py \
  --url https://www.ssa.gov/oact/STATS/table4c6.html \
  --retrieved-at 2026-08-31 \
  --output frontend/src/data/mortality/ssa-period-life-table-2023.json
python modeling/longevity/ssa/verify_artifact.py \
  frontend/src/data/mortality/ssa-period-life-table-2023.json
```

Expected: 240 rows, ages 0–119 for both sexes, matching checksum, and matching source values at ages 0, 65, 95, 110, and 119.

- [ ] **Step 5: Re-run the tests**

Run:

```bash
python -m pytest modeling/longevity/ssa/tests/test_ssa_artifact.py -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit after explicit authorization**

```bash
git add modeling/longevity/ssa frontend/src/data/mortality/ssa-period-life-table-2023.json
git commit -m "feat: add verified SSA mortality artifact"
```

### Task 2: Implement the unadjusted SSA survival engine

**Files:**
- Create: `frontend/src/calculators/longevity/artifacts.js`
- Create: `frontend/src/calculators/longevity/dateMath.js`
- Create: `frontend/src/calculators/longevity/hazardMath.js`
- Create: `frontend/src/calculators/longevity/individualSurvival.js`
- Create: `frontend/src/calculators/longevity/householdSurvival.js`
- Create: `frontend/src/calculators/longevity/summary.js`
- Create: `frontend/src/calculators/longevity/index.js`
- Create: `frontend/src/calculators/longevity/fixtures.js`
- Test: `frontend/src/calculators/longevity/*.test.js`

**Interfaces:**
- Produces: `getSsaQx(sex, age)`, `getHeadlineLifeExpectancy(sex)`, `survivalToDate(args)`, `getIndividualLongevity(args)`, `getHouseholdLongevity(args)`, and `buildLongevitySummary(args)`.
- `fixtures.js` exports these shared deterministic fixtures:

```javascript
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
```

- `buildLongevitySummary({ people, asOfDate })` returns:

```javascript
{
  asOfDate,
  individuals: {
    [personId]: {
      personId, name, sex, birthDate, estimateType, headlineAge,
      curve, thresholds: { 75: number, 50: number, 25: number },
      capped: { 75: boolean, 50: boolean, 25: boolean },
      capYear, sourceDisclosure
    }
  },
  household: null | {
    curve, thresholds: { 75: number | null, 50: number | null, 25: number | null },
    capped: { 75: boolean, 50: boolean, 25: boolean },
    capYear
  },
  axisEndYear,
  modelVersion: null
}
```

- [ ] **Step 1: Write artifact accessor and hazard transformation tests**

```javascript
test('getSsaQx returns exact decimal probabilities', () => {
  expect(getSsaQx('male', 65)).toBe(ssaArtifact.data.male[65].qx);
  expect(() => getSsaQx('unknown', 65)).toThrow(/unsupported sex/i);
  expect(() => getSsaQx('male', 120)).toThrow(/supported age/i);
});

test('qx and hazard transformations round trip', () => {
  [0.0001, 0.01, 0.25, 0.9].forEach((qx) => {
    expect(hazardToQx(qxToHazard(qx))).toBeCloseTo(qx, 14);
  });
});
```

- [ ] **Step 2: Write partial-year date and individual-threshold tests**

```javascript
test('survival starts at one on the explicit as-of date', () => {
  const person = { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' };
  expect(survivalToDate({ person, asOfDate: new Date(2026, 7, 31), targetDate: new Date(2026, 7, 31) })).toBe(1);
});

test('whole-age threshold is the greatest birthday whose survival meets the probability', () => {
  const result = getIndividualLongevity({
    person: { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' },
    asOfDate: new Date(2026, 7, 31)
  });
  [75, 50, 25].forEach((probability) => {
    const age = result.thresholds[probability];
    expect(result.curve.find((point) => point.age === age).survival).toBeGreaterThanOrEqual(probability / 100);
    expect(result.curve.find((point) => point.age === age + 1)?.survival ?? 0).toBeLessThan(probability / 100);
  });
});
```

- [ ] **Step 3: Write shared-calendar household tests**

```javascript
test('household probability combines both people on the same December 31', () => {
  const result = getHouseholdLongevity({
    people: [
      { personId: 'ted', name: 'Ted', sex: 'male', birthDate: '1965-06-15' },
      { personId: 'mary', name: 'Mary', sex: 'female', birthDate: '1970-02-10' }
    ],
    asOfDate: new Date(2026, 7, 31)
  });
  result.curve.forEach(({ year, eitherAlive, individualSurvival }) => {
    expect(year).toBeGreaterThanOrEqual(2026);
    expect(eitherAlive).toBeCloseTo(
      1 - (1 - individualSurvival.ted) * (1 - individualSurvival.mary),
      14
    );
  });
});
```

- [ ] **Step 4: Run the new tests and verify they fail**

Run:

```bash
cd frontend
CI=true npx react-scripts test src/calculators/longevity --watchAll=false
```

Expected: module-not-found failures.

- [ ] **Step 5: Implement the pure SSA path**

Implement constant-within-birthday-interval hazards:

```javascript
export const survivalForFraction = (qx, fraction) =>
  Math.exp(-qxToHazard(qx) * fraction);
```

Use exact day counts between birthdays for partial exposure. Apply unadjusted SSA hazards below age 60 and whenever a complete personalization profile is absent. Generate individual points at birthdays and household points at December 31. Stop at supported ages, and return capped metadata instead of applying a fallback mortality factor.

- [ ] **Step 6: Implement display-cap and axis rules in `summary.js`**

```javascript
export const getHouseholdCapYear = (people) => {
  const years = people.map((person) => new Date(`${person.birthDate}T12:00:00`).getFullYear());
  const earlierBirthYear = Math.min(...years);
  const laterBirthYear = Math.max(...years);
  return Math.min(laterBirthYear + 110, earlierBirthYear + 119);
};

export const roundAxisEnd = ({ latestYear, capYear }) =>
  latestYear >= capYear ? capYear : Math.min(capYear, Math.ceil(latestYear / 5) * 5);
```

- [ ] **Step 7: Run all engine tests**

Run:

```bash
cd frontend
CI=true npx react-scripts test src/calculators/longevity --watchAll=false
```

Expected: all SSA-only engine tests pass.

- [ ] **Step 8: Commit after explicit authorization**

```bash
git add frontend/src/calculators/longevity
git commit -m "feat: add shared SSA longevity engine"
```

### Task 3: Build the reproducible NHIS cohort and harmonization pipeline

**Files:**
- Create: `modeling/longevity/nhis-v1/README.md`
- Create: `modeling/longevity/nhis-v1/renv.lock`
- Create: `modeling/longevity/nhis-v1/config/cohorts.yml`
- Create: `modeling/longevity/nhis-v1/config/variable-map.yml`
- Create: `modeling/longevity/nhis-v1/R/load_inputs.R`
- Create: `modeling/longevity/nhis-v1/R/harmonize.R`
- Create: `modeling/longevity/nhis-v1/R/impute.R`
- Create: `modeling/longevity/nhis-v1/R/person_quarter.R`
- Create: `modeling/longevity/nhis-v1/tests/testthat/test-harmonize.R`
- Create: `modeling/longevity/nhis-v1/tests/testthat/test-person-quarter.R`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: official public-use NHIS Person and Sample Adult files plus the 2019 public-use Linked Mortality Files.
- Produces: canonical respondent records with `person_id`, `survey_year`, `interview_quarter`, `age_at_interview`, `sex`, `smoking`, `education`, `self_rated_health`, `sample_weight`, `stratum`, `psu`, `mortality_status`, `death_year`, and `death_quarter`.

- [ ] **Step 1: Add raw-data exclusions**

```gitignore
modeling/longevity/**/raw/
modeling/longevity/**/interim/
modeling/longevity/**/.renv/
modeling/longevity/**/renv/library/
*.xpt
*.dta
```

- [ ] **Step 2: Initialize the isolated R environment and define exact cohort configuration**

Run once from `modeling/longevity/nhis-v1`:

```bash
Rscript -e 'if (!requireNamespace("renv", quietly = TRUE)) install.packages("renv"); renv::init(bare = TRUE); renv::install(c("survey", "mice", "mitools", "haven", "jsonlite", "yaml", "digest", "testthat")); renv::snapshot()'
```

```yaml
development:
  interview_years: [1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009]
  minimum_age: 60
temporal_validation:
  interview_years: [2010, 2011, 2012, 2013]
  minimum_age: 60
production_fit:
  interview_years: [1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013]
  minimum_age: 60
calibration_target:
  interview_years: [2015, 2016, 2017, 2018]
  age_bands: ["60-69", "70-79", "80+"]
mortality_followup_end: "2019-12-31"
```

- [ ] **Step 3: Write harmonization tests using small synthetic raw extracts**

```r
test_that("all source codes map to one runtime category or explicit missing", {
  harmonized <- harmonize_health(synthetic_nhis_rows())
  expect_setequal(na.omit(harmonized$smoking), c("never", "former", "current"))
  expect_setequal(na.omit(harmonized$education), c("college", "some", "high_school"))
  expect_setequal(na.omit(harmonized$self_rated_health), c("excellent", "good", "fair"))
  expect_setequal(na.omit(harmonized$sex), c("male", "female"))
})

test_that("pooled weights divide annual weights by cohort year count", {
  rows <- data.frame(sample_weight = c(1300, 2600), pool_year_count = c(13, 13))
  expect_equal(pool_weights(rows), c(100, 200))
})
```

- [ ] **Step 4: Run the R tests and verify they fail**

Run:

```bash
cd modeling/longevity/nhis-v1
Rscript -e 'testthat::test_dir("tests/testthat")'
```

Expected: missing harmonization functions.

- [ ] **Step 5: Populate `variable-map.yml` from the official annual codebooks**

For every interview year, map and join the official Person-file fields for respondent ID, interview quarter, age, sex, education, self-rated health, sample-adult weight, stratum, and PSU with the Sample Adult smoking field. Map the linked-mortality eligibility, death indicator, death year, and death quarter fields. The loader must reject a year if any required mapping is absent, if the one-to-one person join fails, or if an observed source code lacks an explicit mapping.

- [ ] **Step 6: Implement harmonization and 20-dataset imputation**

Use `mice` only for model-development records. Include outcome, age, sex, survey year, weight, smoking, education, and health in the imputation model. Do not impute runtime user answers or calibration-target profile cells; incomplete runtime profiles follow the SSA-only path.

- [ ] **Step 7: Implement person-quarter expansion without invented dates**

```r
quarter_index <- function(year, quarter) year * 4L + quarter - 1L

expand_person_quarters <- function(row) {
  entry <- quarter_index(row$survey_year, row$interview_quarter)
  exit <- if (row$mortality_status == 1L) {
    quarter_index(row$death_year, row$death_quarter)
  } else {
    quarter_index(2019L, 4L)
  }
  stopifnot(exit >= entry)
  observed_quarters <- seq.int(entry, exit)
  quarters_since_interview <- observed_quarters - entry
  data.frame(
    person_id = row$person_id,
    quarter_index = observed_quarters,
    quarters_since_interview = quarters_since_interview,
    attained_age = row$age_at_interview + floor(quarters_since_interview / 4),
    event = as.integer(observed_quarters == exit && row$mortality_status == 1L)
  )
}
```

Tests must cover alive censoring at 2019 Q4, death in a later quarter, death in the interview quarter, invalid death-before-interview data, attained-age advancement after four quarters, and retention of survey design and profile fields.

- [ ] **Step 8: Run harmonization tests**

Run:

```bash
cd modeling/longevity/nhis-v1
Rscript -e 'testthat::test_dir("tests/testthat")'
```

Expected: harmonization and person-quarter tests pass against synthetic fixtures.

- [ ] **Step 9: Commit after explicit authorization**

```bash
git add .gitignore modeling/longevity/nhis-v1
git commit -m "feat: add reproducible NHIS mortality cohort pipeline"
```

### Task 4: Fit, validate, calibrate, and export the NHIS model

**Files:**
- Create: `modeling/longevity/nhis-v1/R/fit_model.R`
- Create: `modeling/longevity/nhis-v1/R/validate_model.R`
- Create: `modeling/longevity/nhis-v1/R/calibrate_ssa.R`
- Create: `modeling/longevity/nhis-v1/R/export_artifact.R`
- Create: `modeling/longevity/nhis-v1/run_pipeline.R`
- Create: `modeling/longevity/nhis-v1/tests/testthat/test-calibration.R`
- Create: `modeling/longevity/nhis-v1/tests/testthat/test-artifact.R`
- Create: `modeling/longevity/nhis-v1/validation/temporal-validation-v1.json`
- Create: `frontend/src/data/mortality/nhis-personalization-v1.json`

**Interfaces:**
- Consumes: harmonized/imputed NHIS cohorts and `ssa-period-life-table-2023.json`.
- Produces: versioned profile coefficients and an age/sex `lambda` table whose weighted profile `qx` equals SSA `qx`.

- [ ] **Step 1: Write calibration solver tests**

```r
test_that("solved lambda reproduces SSA qx on the probability scale", {
  rr <- c(0.7, 1.0, 1.8)
  weights <- c(0.3, 0.5, 0.2)
  ssa_qx <- 0.02
  lambda <- solve_lambda(ssa_qx, rr, weights)
  calibrated <- 1 - exp(-lambda * rr)
  expect_lt(abs(weighted.mean(calibrated, weights) - ssa_qx), 1e-10)
})
```

- [ ] **Step 2: Fit the locked development model**

Use one survey-weighted complementary log-log model per imputed dataset:

```r
svyglm(
  event ~ factor(attained_age) + sex + smoking + education +
    self_rated_health + I(survey_year - 2014),
  design = person_quarter_design,
  family = quasibinomial(link = "cloglog")
)
```

Combine profile coefficients and covariance matrices with Rubin's rules. Do not add interactions in version one.

- [ ] **Step 3: Implement temporal validation before production refit**

Apply the untouched 1997–2009 development model to 2010–2013 interviews. Calculate censoring-adjusted Brier scores, calibration-in-the-large, calibration slope, and weighted observed-minus-predicted mortality at 4, 12, and 20 observed quarters.

Fail the pipeline unless:

- absolute overall mortality error is at most 0.02 at each horizon;
- absolute subgroup mortality error is at most 0.03 for each gated group with at least 100 observed deaths; and
- calibration slope is between 0.80 and 1.20 at each horizon.

- [ ] **Step 4: Refit the locked formula on the production cohort**

After temporal validation passes, refit the unchanged formula on 1997–2013. Export only smoking, education, and health profile coefficients for runtime relative-hazard scoring. Age, sex, and interview-year terms remain documented nuisance terms.

- [ ] **Step 5: Build calibration profile distributions**

From weighted 2015–2018 respondents, calculate the joint frequency of every complete smoking × education × health combination separately for male/female and age bands 60–69, 70–79, and 80+. Use the 80+ distribution for ages 80–119.

- [ ] **Step 6: Solve all age/sex calibration hazards**

For every sex and age 60–119, solve:

```r
uniroot(
  function(lambda) weighted.mean(1 - exp(-lambda * relative_hazard), profile_weight) - ssa_qx,
  interval = c(0, -log(1 - min(0.999999999, ssa_qx)) * 100)
)$root
```

Assert absolute weighted error `<= 1e-10`.

- [ ] **Step 7: Export and schema-test the runtime artifact**

The artifact builder must populate every field from the pipeline run:

```javascript
const artifact = {
  schemaVersion: 1,
  artifactType: 'nhis-linked-mortality-personalization',
  modelVersion: 'nhis-lmf-2019-v1',
  sourceUrls: runMetadata.sourceUrls,
  cohorts: cohortConfig,
  fitDate: runMetadata.fitDate,
  softwareVersions: runMetadata.softwareVersions,
  referenceCategories: {
    smoking: 'never',
    education: 'college',
    health: 'excellent'
  },
  coefficients: exportedProfileCoefficients,
  calibrationProfileDistributions: exportedProfileDistributions,
  lambdaBySexAndAge: exportedLambdas,
  validation: temporalValidation
};
```

`sourceUrls`, dates, software versions, coefficients, distributions, lambdas, and validation values must be generated from the run rather than hand-entered.

- [ ] **Step 8: Run the full model pipeline**

Run:

```bash
cd modeling/longevity/nhis-v1
Rscript run_pipeline.R \
  --cohorts config/cohorts.yml \
  --variables config/variable-map.yml \
  --ssa ../../../frontend/src/data/mortality/ssa-period-life-table-2023.json \
  --artifact ../../../frontend/src/data/mortality/nhis-personalization-v1.json \
  --validation validation/temporal-validation-v1.json
```

Expected: all release gates pass and both JSON outputs are written deterministically.

- [ ] **Step 9: Re-run model tests**

Run:

```bash
cd modeling/longevity/nhis-v1
Rscript -e 'testthat::test_dir("tests/testthat")'
```

Expected: all tests pass.

- [ ] **Step 10: Commit after explicit authorization**

```bash
git add modeling/longevity/nhis-v1 frontend/src/data/mortality/nhis-personalization-v1.json
git commit -m "feat: add validated NHIS longevity model"
```

### Task 5: Add runtime personalization and exact SSA calibration tests

**Files:**
- Modify: `frontend/src/calculators/longevity/artifacts.js`
- Create: `frontend/src/calculators/longevity/personalization.js`
- Test: `frontend/src/calculators/longevity/personalization.test.js`
- Test: `frontend/src/calculators/longevity/calibration.test.js`
- Modify: `frontend/src/calculators/longevity/individualSurvival.js`

**Interfaces:**
- Produces: `isCompleteLongevityProfile(profile)`, `getRelativeHazard(profile)`, `getCalibrationDistribution(sex, age)`, and `getAnnualQx({ sex, age, profile })`.
- `getAnnualQx` returns SSA `qx` below age 60 or for an incomplete profile; otherwise it applies the exported age/sex lambda and joint relative hazard.

- [ ] **Step 1: Write joint-scoring and fallback tests**

```javascript
const completeTedProfile = {
  smoking: 'never',
  education: 'college',
  health: 'good'
};

test('incomplete profiles use the exact SSA probability', () => {
  expect(getAnnualQx({
    sex: 'male',
    age: 70,
    profile: { smoking: 'never', education: null, health: 'good' }
  })).toBe(getSsaQx('male', 70));
});

test('all three predictors are scored in one linear predictor', () => {
  const profile = { smoking: 'current', education: 'high_school', health: 'fair' };
  const expected = Math.exp(
    nhisArtifact.coefficients.smoking.current +
    nhisArtifact.coefficients.education.high_school +
    nhisArtifact.coefficients.health.fair
  );
  expect(getRelativeHazard(profile)).toBeCloseTo(expected, 14);
});

test('a malformed model degrades the summary to SSA and emits a diagnostic', () => {
  const onDiagnostic = jest.fn();
  const artifactMissingHealthCoefficient = JSON.parse(JSON.stringify(nhisArtifact));
  delete artifactMissingHealthCoefficient.coefficients.health.good;
  const summary = buildLongevitySummary({
    people: [{ ...ted, profile: completeTedProfile }],
    asOfDate: fixedAsOfDate,
    modelArtifact: artifactMissingHealthCoefficient,
    onDiagnostic
  });
  expect(summary.individuals.ted.estimateType).toBe('ssa-population');
  expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
    code: 'INVALID_MORTALITY_MODEL'
  }));
});
```

- [ ] **Step 2: Write an exhaustive calibration parity test**

```javascript
for (const sex of ['male', 'female']) {
  for (let age = 60; age <= 119; age += 1) {
    test(`${sex} age ${age} profiles reproduce SSA qx`, () => {
      const distribution = getCalibrationDistribution(sex, age);
      const meanQx = distribution.reduce(
        (sum, cell) => sum + cell.weight * getAnnualQx({ sex, age, profile: cell.profile }),
        0
      );
      expect(Math.abs(meanQx - getSsaQx(sex, age))).toBeLessThanOrEqual(1e-10);
    });
  }
}
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd frontend
CI=true npx react-scripts test \
  src/calculators/longevity/personalization.test.js \
  src/calculators/longevity/calibration.test.js \
  --watchAll=false
```

Expected: missing personalization functions.

- [ ] **Step 4: Implement artifact validation and calibrated scoring**

Reject missing coefficients, unsupported categories, malformed lambdas, non-normalized calibration weights, and artifact version mismatches. The caller catches these errors and degrades to a labeled SSA population estimate; the scoring function must not silently degrade.

`buildLongevitySummary` accepts an optional `onDiagnostic` callback, catches only typed model-artifact or scoring errors, reports `{ code: 'INVALID_MORTALITY_MODEL', cause }`, and recomputes the affected person through the SSA-only path. Programming errors continue to throw.

- [ ] **Step 5: Thread personalized `qx` into the individual and household curves**

Keep the public summary shape unchanged. Change only `estimateType`, `modelVersion`, source disclosure, and probabilities when all three profile answers are present.

- [ ] **Step 6: Run all longevity engine tests**

Run:

```bash
cd frontend
CI=true npx react-scripts test src/calculators/longevity --watchAll=false
```

Expected: all tests pass, including exhaustive age/sex calibration.

- [ ] **Step 7: Commit after explicit authorization**

```bash
git add frontend/src/calculators/longevity
git commit -m "feat: apply calibrated NHIS personalization"
```

### Task 6: Persist person-bound longevity profiles

**Files:**
- Modify: `backend/api/preferences.py`
- Create: `frontend/src/calculators/longevity/preferences.js`
- Test: `frontend/src/calculators/longevity/preferences.test.js`
- Create: `backend/tests/test_preferences_life_expectancy.py`

**Interfaces:**
- Produces persisted `preferences.lifeExpectancy` schema version 2:

```javascript
{
  schemaVersion: 2,
  calcType: 'individual' | 'couple',
  profilesByPersonId: {
    [personId]: {
      sex: 'male' | 'female' | null,
      smoking: 'never' | 'former' | 'current' | null,
      education: 'college' | 'some' | 'high_school' | null,
      health: 'excellent' | 'good' | 'fair' | null
    }
  }
}
```

- [ ] **Step 1: Write backend persistence tests**

```python
def test_life_expectancy_is_merged_into_calculator_states(authenticated_client, preference_row):
    response = authenticated_client.put(
        "/api/preferences",
        json={"lifeExpectancy": {"schemaVersion": 2, "profilesByPersonId": {"person-1": {"sex": "male"}}}},
    )
    assert response.status_code == 200
    assert response.json()["preferences"]["lifeExpectancy"]["schemaVersion"] == 2
```

- [ ] **Step 2: Write frontend migration tests**

```javascript
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
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
python -m pytest backend/tests/test_preferences_life_expectancy.py -q
cd frontend
CI=true npx react-scripts test src/calculators/longevity/preferences.test.js --watchAll=false
```

Expected: backend omits `lifeExpectancy`; frontend module is missing.

- [ ] **Step 4: Whitelist `lifeExpectancy` in the API**

```python
calculator_state_keys = ['showMeTheMoney', 'pia', 'divorced', 'widow', 'lifeExpectancy']
```

- [ ] **Step 5: Implement conservative legacy migration**

Use `profile.id || user.id` for the primary person and `partners[0].id` for the partner. Permit fixed `dev-primary` and `dev-partner` IDs only in development mode. Never persist production profiles under positional IDs.

- [ ] **Step 6: Run persistence tests**

Run:

```bash
python -m pytest backend/tests/test_preferences_life_expectancy.py -q
cd frontend
CI=true npx react-scripts test src/calculators/longevity/preferences.test.js --watchAll=false
```

Expected: all tests pass.

- [ ] **Step 7: Commit after explicit authorization**

```bash
git add backend/api/preferences.py backend/tests/test_preferences_life_expectancy.py frontend/src/calculators/longevity/preferences.js frontend/src/calculators/longevity/preferences.test.js
git commit -m "fix: persist person-bound longevity profiles"
```

### Task 7: Refactor the Life Expectancy module onto the shared engine

**Files:**
- Modify: `frontend/src/components/LifeExpectancyCalculator.jsx`
- Create: `frontend/src/calculators/longevity/presentation.js`
- Test: `frontend/src/calculators/longevity/presentation.test.js`

**Interfaces:**
- Consumes: `profile`, `partners`, `preferences`, `updatePreferences`, and `buildLongevitySummary`.
- Produces: cards, chart datasets, table rows, estimate labels, and source disclosure without mortality math in the React component.

- [ ] **Step 1: Write presentation-adapter tests**

```javascript
test('individual cards use whole-age thresholds and at-least wording', () => {
  const summary = buildLongevitySummary({ people: [ted], asOfDate: fixedAsOfDate });
  const model = buildLifeExpectancyPresentation(summary);
  expect(model.cards.map((card) => card.probability)).toEqual([75, 50, 25]);
  expect(model.cards[1].tooltip).toContain('live to at least age');
});

test('incomplete answers disclose an SSA population estimate', () => {
  const summary = buildLongevitySummary({ people: [ted], asOfDate: fixedAsOfDate });
  const model = buildLifeExpectancyPresentation(summary);
  expect(model.sourceDisclosure).toContain('SSA 2023 period life table');
  expect(model.sourceDisclosure).toContain('without projected future improvement');
  expect(model.estimateLabel).toBe('SSA population estimate');
});

test('missing DOB or unsupported sex produces no individual estimate', () => {
  const missingDob = buildLongevitySummary({
    people: [{ ...ted, birthDate: null }],
    asOfDate: fixedAsOfDate
  });
  const unsupportedSex = buildLongevitySummary({
    people: [{ ...ted, sex: 'unknown' }],
    asOfDate: fixedAsOfDate
  });
  expect(buildLifeExpectancyPresentation(missingDob).individuals.ted).toBeUndefined();
  expect(buildLifeExpectancyPresentation(unsupportedSex).individuals.ted).toBeUndefined();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd frontend
CI=true npx react-scripts test src/calculators/longevity/presentation.test.js --watchAll=false
```

Expected: missing presentation module.

- [ ] **Step 3: Implement the presentation adapter**

For couple mode, chart against calendar year rather than a shared attained-age x-axis. Each row includes `year`, each person's age that year, each individual survival probability, both-alive probability, and either-alive probability.

- [ ] **Step 4: Replace positional state in the component**

Use person records:

```javascript
const people = [
  {
    personId: profile?.id || user?.id,
    name: profile?.first_name || 'You',
    birthDate: profile?.date_of_birth,
    ...savedProfiles[profile?.id || user?.id]
  },
  ...(calcType === 'couple' && partners?.[0]
    ? [{
        personId: partners[0].id,
        name: partners[0].first_name || 'Spouse',
        birthDate: partners[0].date_of_birth,
        ...savedProfiles[partners[0].id]
      }]
    : [])
];
```

Replace age sliders with the DOB-derived current age and a profile-settings link. Keep sex as an explicit longevity input because the profile schema does not currently store an SSA-supported sex. Initialize smoking, education, and health to `null`; an unanswered control is visibly unselected.

- [ ] **Step 5: Remove the old calculation implementation**

Delete `QX`, `MULTIPLIERS`, `getMultiplier`, `cumulativeSurvival`, `buildCurve`, `buildEitherCurve`, `buildBothCurve`, and `findThresholdAge`. Remove the CDC disclosure, `p *= 0.3`, and copy claiming published multipliers.

- [ ] **Step 6: Run component-adjacent and engine tests**

Run:

```bash
cd frontend
CI=true npx react-scripts test src/calculators/longevity --watchAll=false
CI=true npm run build
```

Expected: all longevity tests pass and the production build succeeds.

- [ ] **Step 7: Commit after explicit authorization**

```bash
git add frontend/src/components/LifeExpectancyCalculator.jsx frontend/src/calculators/longevity/presentation.js frontend/src/calculators/longevity/presentation.test.js
git commit -m "refactor: share longevity engine with life expectancy UI"
```

### Task 8: Parameterize financial projection horizons

**Files:**
- Modify: `frontend/src/calculators/showMeTheMoney/projections.js`
- Modify: `frontend/src/calculators/showMeTheMoney/projections.test.js`
- Modify: `frontend/src/components/OurLifelongTimeline/timelineMath.js`
- Modify: `frontend/src/components/OurLifelongTimeline/timelineMath.test.js`

**Interfaces:**
- `calculateProjection({ pia, dob, filingYear, filingMonth, inflationRate, asOfDate, endYear })` accepts an optional absolute calendar year. Rename the existing local `const endYear = birthYear + 95` so the optional argument is not shadowed. Its default remains `birthYear + 95` for callers outside the timeline.
- `getHouseholdBucket` and `getHouseholdBuckets` accept the same optional `endYear` and pass it through to every `calculateProjection` call they make. Without this, the timeline's 62/70 comparison boxes still stop at age 95.
- `getAxisEndYear({ birthYears, longevitySummary })` returns the summary's validated axis end.

- [ ] **Step 1: Write projection-horizon tests**

```javascript
test('explicit endYear produces financial data through the final displayed year', () => {
  const projection = calculateProjection({
    pia: 2500,
    dob: '1965-06-15',
    filingYear: 67,
    inflationRate: 0.025,
    asOfDate: new Date(2026, 7, 31),
    endYear: 2070
  });
  expect(Object.keys(projection.monthly).map(Number).at(-1)).toBe(2070);
  expect(projection.cumulative[2070]).toBeGreaterThan(projection.cumulative[2069]);
});

test('default horizon remains age 95 for existing callers', () => {
  const projection = calculateProjection({
    pia: 2500,
    dob: '1965-06-15',
    filingYear: 67,
    inflationRate: 0.025,
    asOfDate: new Date(2026, 7, 31)
  });
  expect(Object.keys(projection.monthly).map(Number).at(-1)).toBe(2060);
});
```

- [ ] **Step 2: Run targeted tests and verify the explicit horizon fails**

Run:

```bash
cd frontend
CI=true npx react-scripts test \
  src/calculators/showMeTheMoney/projections.test.js \
  src/components/OurLifelongTimeline/timelineMath.test.js \
  --watchAll=false
```

- [ ] **Step 3: Add and validate `endYear`**

```javascript
const defaultEndYear = birthYear + 95;
const projectionEndYear = Number.isInteger(endYear) && endYear >= startYear
  ? endYear
  : defaultEndYear;
```

Iterate through `projectionEndYear`. Reject an explicit end before the projection start rather than silently truncating.

Thread the same optional `endYear` through `getHouseholdBucket` and `getHouseholdBuckets`:

```javascript
const primaryProjection = calculateProjection({
  pia: spouse1Pia,
  dob: spouse1Dob,
  filingYear: filingAge,
  filingMonth: 0,
  inflationRate: inflation,
  endYear
});
```

- [ ] **Step 4: Replace the fixed timeline axis helper**

Remove `AXIS_END_AGE`. Make `getAxisEndYear` accept the precomputed longevity summary and assert that `combinedProjections.preferred.monthly[axisEndYear]` exists in the integration test. Update existing `getAxisEndYear(1965, 1970)` tests to the new signature. Keep the regression that the axis end never exceeds the last year of projection data.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
cd frontend
CI=true npx react-scripts test \
  src/calculators/showMeTheMoney/projections.test.js \
  src/components/OurLifelongTimeline/timelineMath.test.js \
  --watchAll=false
```

Expected: all tests pass.

- [ ] **Step 6: Commit after explicit authorization**

```bash
git add frontend/src/calculators/showMeTheMoney/projections.js frontend/src/calculators/showMeTheMoney/projections.test.js frontend/src/components/OurLifelongTimeline/timelineMath.js frontend/src/components/OurLifelongTimeline/timelineMath.test.js
git commit -m "feat: extend projections through longevity horizon"
```

### Task 9: Map longevity summaries to timeline flags

**Files:**
- Create: `frontend/src/components/OurLifelongTimeline/longevityTimelineMath.js`
- Create: `frontend/src/components/OurLifelongTimeline/longevityTimelineMath.test.js`
- Modify: `frontend/src/components/OurLifelongTimeline/timelineMath.js`
- Modify: `frontend/src/components/OurLifelongTimeline/timelineMath.test.js`

**Interfaces:**
- Produces: `getIndividualLongevityMarkers`, `getHouseholdLongevityMarkers`, `formatNamesAndAges`, `buildLongevityTooltip`, and `buildTimelineLongevityPresentation`.
- Marker contract:

```javascript
{
  id,
  kind: 'headline' | 'survival75' | 'survival50' | 'survival25',
  year,
  positionYear,
  chip,
  displayYear,
  tooltip,
  pinned: 'left' | 'right' | null,
  emphasis: 'muted' | 'standard' | 'strong'
}
```

- [ ] **Step 1: Write approved-copy tests**

```javascript
test('headline copy explains the retirement-planning comparison', () => {
  expect(buildLongevityTooltip({ kind: 'headline' })).toBe(
    'Headline U.S. life expectancy starts at birth, so it includes infant deaths and deaths earlier in adulthood from accidents, overdoses, and homicide. These earlier deaths pull the average down. Life expectancy at 65 looks only at people who reached 65, so it is a better starting point for retirement planning.'
  );
});

test('individual threshold copy uses at least age', () => {
  expect(buildLongevityTooltip({
    kind: 'individual',
    probability: 75,
    name: 'Ted',
    age: 78
  })).toBe('There is a 75% chance Ted will live to at least age 78.');
  expect(buildLongevityTooltip({
    kind: 'individual',
    probability: 50,
    name: 'Ted',
    age: 85
  })).toBe('There is a 50% chance Ted will live to at least age 85.');
  expect(buildLongevityTooltip({
    kind: 'individual',
    probability: 25,
    name: 'Mary',
    age: 91
  })).toBe('There is a 25% chance Mary will live to at least age 91.');
});
```

- [ ] **Step 2: Write household and capped-marker tests**

```javascript
test('equal-age household copy uses the shared-age sentence', () => {
  expect(formatNamesAndAges({
    people: [
      { name: 'Ted', birthDate: '1965-06-15' },
      { name: 'Mary', birthDate: '1965-06-15' }
    ],
    year: 2057
  })).toBe('Ted and Mary would both be 92.');
});

test('unequal-age household copy lists both ages in the shared year', () => {
  expect(formatNamesAndAges({
    people: [
      { name: 'Ted', birthDate: '1965-06-15' },
      { name: 'Mary', birthDate: '1970-02-10' }
    ],
    year: 2057
  })).toBe('Ted would be 92, and Mary would be 87.');
});

test('household probability copy uses the approved sentence for each threshold', () => {
  const namesAndAges = 'Ted would be 92, and Mary would be 87.';
  expect(buildLongevityTooltip({
    kind: 'household',
    probability: 75,
    year: 2052,
    namesAndAges
  })).toBe(
    `There is a 75% chance at least one of you will be alive in 2052. ${namesAndAges} A couple's chance that one person lives a long time is higher than either person's chance alone.`
  );
  expect(buildLongevityTooltip({
    kind: 'household',
    probability: 50,
    year: 2057,
    namesAndAges
  })).toBe(
    `There is a 50% chance at least one of you will be alive in 2057. ${namesAndAges} This is why a couple's plan often needs to reach beyond either person's individual life expectancy.`
  );
  expect(buildLongevityTooltip({
    kind: 'household',
    probability: 25,
    year: 2061,
    namesAndAges
  })).toBe(
    `There is a 25% chance at least one of you will be alive in 2061. ${namesAndAges} The surviving spouse may need income years beyond either person's individual life expectancy.`
  );
});

test('household thresholds beyond support do not claim a crossing year', () => {
  const beyondCapSummary = {
    household: {
      thresholds: { 75: 2045, 50: 2054, 25: null },
      capped: { 75: false, 50: false, 25: true },
      capYear: 2075
    },
    people: tedAndMary
  };
  const marker = getHouseholdLongevityMarkers(beyondCapSummary)
    .find((item) => item.probability === 25);
  expect(marker.chip).toBe('Beyond 2075');
  expect(marker.tooltip).toContain('remains above');
  expect(marker.tooltip).not.toContain('chance at least one of you will be alive in');
});

test('individual thresholds beyond age 110 use the capped tooltip', () => {
  const marker = getIndividualLongevityMarkers({
    individuals: {
      ted: {
        personId: 'ted',
        name: 'Ted',
        thresholds: { 75: 108, 50: 110, 25: 110 },
        capped: { 75: false, 50: true, 25: true },
        capYear: 2075
      }
    }
  }).find((item) => item.personId === 'ted' && item.probability === 25);
  expect(marker.chip).toBe('110+');
  expect(marker.tooltip).toBe(
    'The chance Ted lives to at least age 110 remains above 25%. This timeline does not display later ages.'
  );
});

test('one valid spouse keeps individual flags but omits household flags', () => {
  const summary = buildLongevitySummary({
    people: [ted, { ...mary, sex: null }],
    asOfDate: fixedAsOfDate
  });
  const model = buildTimelineLongevityPresentation(summary);
  expect(model.individuals.ted.markers).toHaveLength(4);
  expect(model.household).toBeNull();
  expect(model.householdUnavailableMessage).toBe(
    'Complete both profiles to estimate how long at least one of you may live.'
  );
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd frontend
CI=true npx react-scripts test src/components/OurLifelongTimeline/longevityTimelineMath.test.js --watchAll=false
```

- [ ] **Step 4: Implement headline, individual, household, and cap marker mapping**

Position fractional headline markers at date of birth plus the SSA decimal `ex` value. Display headline age to one decimal and calendar year with round-half-up. Pin a past headline marker to `axisStartYear` with chip `Already passed`.

- [ ] **Step 5: Make timeline reachability support one or two people**

```javascript
export const isTimelineReachable = ({ spouse1Dob }) => Boolean(spouse1Dob);
```

Replace the current married-only gate (`isMarried && spouse1Dob && spouse2Dob`). A single person with a date of birth can open the timeline. A married household missing the spouse date of birth still opens with the valid person's row. Household markers remain absent unless two valid people are present.

Update `timelineMath.test.js`:

```javascript
expect(isTimelineReachable({ isMarried: false, spouse1Dob: '1965-01-01', spouse2Dob: null })).toBe(true);
expect(isTimelineReachable({ isMarried: true, spouse1Dob: '1965-01-01', spouse2Dob: null })).toBe(true);
expect(isTimelineReachable({ isMarried: true, spouse1Dob: '', spouse2Dob: '1970-01-01' })).toBe(false);
```

- [ ] **Step 6: Run timeline math tests**

Run:

```bash
cd frontend
CI=true npx react-scripts test \
  src/components/OurLifelongTimeline/longevityTimelineMath.test.js \
  src/components/OurLifelongTimeline/timelineMath.test.js \
  --watchAll=false
```

Expected: all tests pass.

- [ ] **Step 7: Commit after explicit authorization**

```bash
git add frontend/src/components/OurLifelongTimeline/longevityTimelineMath.js frontend/src/components/OurLifelongTimeline/longevityTimelineMath.test.js frontend/src/components/OurLifelongTimeline/timelineMath.js frontend/src/components/OurLifelongTimeline/timelineMath.test.js
git commit -m "feat: map longevity probabilities to timeline flags"
```

### Task 10: Render accessible longevity flag tooltips and the household row

**Files:**
- Create: `frontend/src/components/OurLifelongTimeline/LongevityFlagPopover.jsx`
- Create: `frontend/src/components/OurLifelongTimeline/LongevityFlagPopover.test.jsx`
- Create: `frontend/src/components/OurLifelongTimeline/HouseholdLongevityRow.jsx`
- Create: `frontend/src/components/OurLifelongTimeline/HouseholdLongevityRow.test.jsx`
- Modify: `frontend/src/components/OurLifelongTimeline/CalendarPhaseBar.jsx`
- Modify: `frontend/src/components/OurLifelongTimeline/OurLifelongTimeline.jsx`

**Interfaces:**
- `LongevityFlagPopover({ marker, leftPercent, stackIndex, onActivate })`
- `HouseholdLongevityRow({ label, markers, axisStartYear, axisEndYear })`

- [ ] **Step 1: Write raw React accessibility tests**

Follow the existing `createRoot` and `act` pattern from `HouseholdWorkStopPanel.test.jsx`.

```javascript
test('opens on focus and closes with Escape while restoring trigger focus', async () => {
  const marker = {
    id: 'ted-survival50',
    kind: 'survival50',
    year: 2050,
    positionYear: 2050,
    chip: '50%',
    displayYear: 2050,
    tooltip: 'There is a 50% chance Ted will live to at least age 85.',
    pinned: null,
    emphasis: 'strong'
  };
  await act(async () => root.render(<LongevityFlagPopover marker={marker} leftPercent={50} />));
  const trigger = container.querySelector('button');
  trigger.focus();
  expect(container.querySelector('[role="tooltip"]').textContent).toContain(marker.tooltip);
  await act(async () => trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test('household row renders probability flags without retirement phases', async () => {
  const markers = getHouseholdLongevityMarkers(buildLongevitySummary({
    people: tedAndMary,
    asOfDate: fixedAsOfDate
  }));
  await act(async () => root.render(
    <HouseholdLongevityRow
      label="At least one alive"
      markers={markers}
      axisStartYear={2026}
      axisEndYear={2075}
    />
  ));
  expect(container.textContent).toContain('At least one alive');
  expect(container.querySelectorAll('button')).toHaveLength(3);
  expect(container.textContent).not.toContain('Go-Go');
  expect(container.textContent).not.toContain('Slow-Go');
  expect(container.textContent).not.toContain('No-Go');
});
```

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
cd frontend
CI=true npx react-scripts test \
  src/components/OurLifelongTimeline/LongevityFlagPopover.test.jsx \
  src/components/OurLifelongTimeline/HouseholdLongevityRow.test.jsx \
  --watchAll=false
```

- [ ] **Step 3: Implement the popover state machine**

Track `hovered`, `focused`, and `pinnedOpen`. Render while any state is true. On click/tap, toggle `pinnedOpen`; on Escape or outside pointer-down, clear it and focus the trigger. Use `aria-describedby`, `aria-expanded`, `role="tooltip"`, and a stable `useId()` ID. Clamp the tooltip within the nearest scroll viewport.

- [ ] **Step 4: Extend `CalendarPhaseBar` marker styling**

Keep filing milestones unchanged. Keep `MIN_AGE = 62` and `MAX_AGE = 95` for the colored phase bar and drag handles. Longevity markers use the full `axisStartYear`–`axisEndYear` track, including years after 95.

Filing milestones with `yearToPercent(m.year) < 0` still skip rendering. A past headline flag must not skip: its `positionYear` is `axisStartYear`, so it pins to the visible left edge.

Render longevity markers through `LongevityFlagPopover`:

- headline: dashed line and muted chip;
- 75% and 25%: standard chip with visible percentage text;
- 50%: larger or heavier chip;
- left/right pinned: directional edge treatment and text;
- all markers: text/icon distinction in addition to color.

Replace the comment and stacking logic that assumes at most two markers. Group all markers by `positionYear`, assign unbounded stack indices, and alternate dense longevity markers above and below the bar after the first two levels.

- [ ] **Step 5: Implement `HouseholdLongevityRow`**

Render a neutral horizontal track labeled `At least one alive` with only 75%, 50%, and 25% longevity markers. Do not render filing markers or phase colors on this row.

- [ ] **Step 6: Refactor `OurLifelongTimeline` for optional spouse**

For a single person:

- render one `CalendarPhaseBar`;
- omit the household row;
- pass single-person ages and projections to the existing cursor;
- omit spouse narrative fragments;
- relabel the cursor comparison boxes to "If you filed at 62", "Your Plan", and "If you filed at 70". Do not show "If both filed" copy.

For a couple:

- render both phase bars and the household row;
- update vertical offsets for the year ruler, death marker, and cursor tooltip;
- retain the existing filing comparison and survivor behavior.

- [ ] **Step 7: Run component and timeline tests**

Run:

```bash
cd frontend
CI=true npx react-scripts test src/components/OurLifelongTimeline --watchAll=false
CI=true npm run build
```

Expected: tests and build pass.

- [ ] **Step 8: Commit after explicit authorization**

```bash
git add frontend/src/components/OurLifelongTimeline
git commit -m "feat: render accessible longevity timeline flags"
```

### Task 11: Wire the shared summary into Show Me the Money

**Files:**
- Modify: `frontend/src/components/ShowMeTheMoneyCalculator.jsx`
- Test: `frontend/src/calculators/longevity/parity.test.js`
- Modify: `frontend/src/components/OurLifelongTimeline/OurLifelongTimeline.jsx`

**Interfaces:**
- Produces one memoized `longevitySummary` before financial projections.
- Passes `longevitySummary`, `onPersonalizeClick`, and projection data through the computed axis end to `OurLifelongTimeline`.

- [ ] **Step 1: Write cross-interface parity fixtures**

```javascript
test('life expectancy and timeline adapters use identical thresholds', () => {
  const summary = buildLongevitySummary({
    people: tedAndMary,
    asOfDate: new Date(2026, 7, 31)
  });
  const lifeModel = buildLifeExpectancyPresentation(summary);
  const timelineModel = buildTimelineLongevityPresentation(summary);
  expect(timelineModel.individuals.ted.thresholds).toEqual(lifeModel.individuals.ted.thresholds);
  expect(timelineModel.household.thresholds).toEqual(lifeModel.household.thresholds);
});
```

- [ ] **Step 2: Write projection-coverage integration test**

```javascript
test('preferred projections cover the complete longevity axis', () => {
  const longevitySummary = buildLongevitySummary({
    people: tedAndMary,
    asOfDate: new Date(2026, 7, 31)
  });
  const primary = calculateProjection({
    ...tedProjectionInputs,
    asOfDate: new Date(2026, 7, 31),
    endYear: longevitySummary.axisEndYear
  });
  const spouse = calculateProjection({
    ...maryProjectionInputs,
    asOfDate: new Date(2026, 7, 31),
    endYear: longevitySummary.axisEndYear
  });
  const combined = combineProjections({
    primaryProjection: primary,
    spouseProjection: spouse,
    isMarried: true
  });
  expect(combined.monthly[longevitySummary.axisEndYear]).toBeDefined();
  expect(combined.cumulative[longevitySummary.axisEndYear]).toBeDefined();
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cd frontend
CI=true npx react-scripts test \
  src/calculators/longevity/parity.test.js \
  src/calculators/showMeTheMoney \
  --watchAll=false
```

- [ ] **Step 4: Build the person records and summary before `scenarioData`**

Use actual profile and partner UUIDs, names, DOBs, and saved person-bound longevity profiles. Memoize with a day-stable `asOfDate` created at the calculator boundary.

- [ ] **Step 5: Pass `longevitySummary.axisEndYear` to every projection used by the timeline**

Apply the same end year to preferred, age-62, and age-70 projections for each person before calling `combineProjections`. Pass that same `endYear` into `getHouseholdBuckets` inside `OurLifelongTimeline` so the 62/70 tooltip boxes cover the displayed axis.

- [ ] **Step 6: Pass summary and personalization navigation to the timeline**

`LifeExpectancyCalculator` currently reads only `preferences`, `updatePreferences`, and `user`. Also read `profile` and `partners` from `useUser()`, matching `ShowMeTheMoneyCalculator`.

Incomplete personalization shows a "Personalize these ages" control that calls `onPersonalizeClick` and navigates to `/life-expectancy`. The timeline source disclosure must say either:

```text
SSA 2023 period life table. Population estimate based on age and sex, using 2023 mortality rates without projected future improvement.
```

or:

```text
SSA 2023 period life table, personalized with a U.S. NHIS Linked Mortality model, version {modelVersion}. Uses 2023 mortality rates without projected future improvement.
```

- [ ] **Step 7: Run affected tests and build**

Run:

```bash
cd frontend
CI=true npx react-scripts test \
  src/calculators/longevity \
  src/calculators/showMeTheMoney \
  src/components/OurLifelongTimeline \
  --watchAll=false
CI=true npm run build
```

Expected: all tests and build pass.

- [ ] **Step 8: Commit after explicit authorization**

```bash
git add frontend/src/components/ShowMeTheMoneyCalculator.jsx frontend/src/components/OurLifelongTimeline/OurLifelongTimeline.jsx frontend/src/calculators/longevity/parity.test.js
git commit -m "feat: connect longevity estimates to household timeline"
```

### Task 12: Complete documentation and end-to-end verification

**Files:**
- Create: `docs/MORTALITY-DATA-LINEAGE.md`
- Modify: `docs/DATA-LINEAGE.md`
- Modify: `docs/MODELING-ASSUMPTIONS.md`
- Modify: `docs/superpowers/specs/2026-08-31-ssa-longevity-timeline-design.md` only if implementation reveals a confirmed discrepancy.

**Interfaces:**
- Produces: a source-to-screen audit trail and release evidence.

- [ ] **Step 1: Document mortality lineage**

Include:

1. SSA source URL, mortality year, Trustees Report year, retrieval date, checksum, and update procedure.
2. NHIS Person, Sample Adult, and mortality source releases; cohort years; exact join keys and canonical category mappings; exclusions; pooled weights; imputation; person-quarter construction; model formula; validation gates; and results.
3. Probability-scale calibration equation and calibration profile distributions.
4. Runtime path from JSON artifacts through `buildLongevitySummary` to both interfaces.
5. Conditional-independence and no-future-mortality-improvement assumptions.
6. Error, fallback, cap, and model-version behavior.

- [ ] **Step 2: Update existing assumption and lineage indexes**

Replace the hard age-95 timeline assumption with the dynamic longevity horizon and link to `docs/MORTALITY-DATA-LINEAGE.md`. Record that unrelated calculator views retain their existing default horizon unless they receive an explicit `endYear`.

- [ ] **Step 3: Run artifact verification**

Run:

```bash
python modeling/longevity/ssa/verify_artifact.py frontend/src/data/mortality/ssa-period-life-table-2023.json
cd modeling/longevity/nhis-v1
Rscript -e 'testthat::test_dir("tests/testthat")'
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
python -m pytest -q
```

Expected: zero failures.

- [ ] **Step 5: Run the full frontend suite**

Run:

```bash
cd frontend
CI=true npx react-scripts test --watchAll=false
CI=true npm run build
```

Expected: zero test failures and a successful production build.

- [ ] **Step 6: Perform browser verification at desktop and mobile widths**

Verify:

- individual mode renders one timeline row and no household row;
- couple mode renders two person rows and one "At least one alive" row;
- incomplete profiles show SSA population estimates and the personalization link;
- completed profiles show model version and personalized flags;
- headline flags explain life expectancy at birth versus at 65;
- Ted and Mary each show their own 75%, 50%, and 25% values;
- household flags use a shared year and correct attained ages;
- past headline, `110+`, and `Beyond {capYear}` markers stay visible;
- timeline income never becomes a false zero after age 95;
- hover, focus, click, tap, Escape, outside click, and focus restoration work;
- tooltips stay within the visible scroll viewport at 200% zoom; and
- no CDC source claim, multiplier claim, or illustrative marker remains.

- [ ] **Step 7: Inspect the final diff for forbidden legacy logic**

Run:

```bash
rg "CDC United States Life Tables|MULTIPLIERS|p \\*= 0\\.3|Effects are multiplicative|findThresholdAge" frontend/src
git diff --check
git status --short
```

Expected: no production matches for the legacy mortality implementation and no whitespace errors.

- [ ] **Step 8: Commit after explicit authorization**

```bash
git add docs/MORTALITY-DATA-LINEAGE.md docs/DATA-LINEAGE.md docs/MODELING-ASSUMPTIONS.md
git commit -m "docs: record longevity model lineage and verification"
```

## Execution Sequence

1. Tasks 1–2 deliver a reviewable SSA-only engine and remove dependence on the CDC table for new calculations.
2. Tasks 3–5 deliver the independently reproducible NHIS personalization artifact and runtime calibration.
3. Tasks 6–7 migrate persistence and the Life Expectancy module.
4. Tasks 8–11 extend projections and integrate individual and household flags into the timeline.
5. Task 12 is the release gate.

Do not start Tasks 6–11 with fabricated model coefficients. If Tasks 3–5 are blocked on obtaining the public-use files, keep the application on the labeled SSA-only path and record the data-access blocker rather than retaining or recreating the old multipliers.
