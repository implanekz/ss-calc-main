# Mortality data lineage

Source-to-screen audit for longevity estimates in the Life Expectancy module and Our Lifelong Timeline. SSA 2023 is the only absolute mortality baseline. The application never fetches SSA or NCHS data at runtime.

## 1. SSA 2023 period life table

| Field | Value |
|---|---|
| Official page | https://www.ssa.gov/oact/STATS/table4c6.html |
| Mortality year | 2023 |
| Trustees Report year | 2026 |
| Population | Social Security area |
| Retrieval date | 2026-08-31 |
| Age range | 0–119, male and female |
| Units | One-year probability of death (`qx`), plus `lx` and `ex` |
| Runtime artifact | `frontend/src/data/mortality/ssa-period-life-table-2023.json` |
| Canonical checksum | `0633dca104495208a36f0413d0fa6f492d489a4a7a13c491f5102e44ff84f715` |

Checksum covers the canonical `data` payload only (`sex|age|qx|lx|ex` lines). Metadata such as `retrievedAt` is excluded. Regeneration and verification live in `modeling/longevity/ssa/`. The live SSA URL may return 403 from some networks; tests parse the committed HTML snapshot at `modeling/longevity/ssa/fixtures/table4c6-2023.html`.

This is a period table. Runtime calculations apply 2023 age-specific mortality rates to future years and do not project future mortality improvement.

## 2. NHIS linked-mortality personalization (version one)

The offline pipeline is `modeling/longevity/nhis-v1/`. It is not executed by the application backend.

**Sources**

- NHIS 1997–2018 Person files (education, self-rated health, demographics, survey design, interview quarter)
- NHIS 1997–2018 Sample Adult files (smoking)
- NCHS public-use Linked Mortality Files through 2019 Q4

Join key: official 14-character public identifier. 2004 is excluded because the official Person and Sample Adult layouts have no interview quarter.

**Cohorts**

| Cohort | Interview years | Use |
|---|---|---|
| Development | 1997–2009, age ≥ 60, excluding 2004 | Lock the formula |
| Temporal validation | 2010–2013, age ≥ 60 | Release gates |
| Production fit | 1997–2013, excluding 2004 | Coefficients after gates pass |
| Calibration target | 2015–2018 | Weighted profile mix for SSA calibration |

**Canonical categories**

- Smoking: never / former / current
- Education: college / some college / high school or less
- Health: excellent or very good / good / fair or poor

**Construction**

- Pool Sample Adult weights by dividing by the number of pooled years.
- Impute missing development covariates with 20-dataset `mice` and combine with Rubin's rules. Runtime scoring never imputes a user's answers.
- Expand each respondent into person-quarter rows from interview quarter through death quarter or 2019 Q4 censoring. Attained age is `ageAtInterview + floor(quartersSinceInterview / 4)`.
- Fit a survey-weighted complementary log-log model with attained-age indicators, sex, interview year centered at 2014, and the three profile main effects. No interactions in version one.

**Validation gates** (2010–2013, 4 / 12 / 20 observed quarters)

- Overall |observed − predicted| ≤ 0.02
- Subgroup |error| ≤ 0.03 when the group has at least 100 deaths
- Calibration slope in [0.80, 1.20]

Committed evidence: `modeling/longevity/nhis-v1/validation/temporal-validation-v1.json`. The locked formula did **not** pass those gates (overall slope ≈ 1.26–1.29; some health and 80+ subgroup errors exceeded 0.03). Production coefficients are therefore **not** exported. Runtime fails closed to a labeled SSA population estimate until a passing model version exists. Do not invent coefficients to ship personalization.

## 3. Calibration equation

For each attained age and sex, solve `lambda` on the probability scale so that:

`weightedMean(1 - exp(-lambda × relativeHazard)) = ssaQx`

using the frozen 2015–2018 NHIS profile mix in bands 60–69, 70–79, and 80+ (the 80+ mix applies through age 119). Then:

`profileQx = 1 - exp(-lambda × relativeHazard)`

Users younger than 60 receive unadjusted SSA `qx` through their 60th birthday. Incomplete profiles, missing artifacts, or invalid coefficients also use unadjusted SSA `qx` and are labeled as a population estimate.

## 4. Runtime path

```
ssa-period-life-table-2023.json
  → artifacts.js (schema + checksum)
  → personalization.js (optional NHIS scoring; SSA-only while the artifact is absent)
  → individualSurvival.js / householdSurvival.js
  → summary.js (buildLongevitySummary)
      → Life Expectancy cards/chart via presentation.js
      → Our Lifelong Timeline flags via longevityTimelineMath.js
```

Household survival evaluates both people at December 31 of the same calendar year:

`eitherAlive(y) = 1 - (1 - person1Alive(y)) × (1 - person2Alive(y))`

Individual flags use the greatest whole birthday age whose survival remains at or above 75%, 50%, or 25%. Cards and flags do not interpolate.

## 5. Assumptions that must stay visible

- Conditional independence of spouses given fitted profiles. Within-couple mortality dependence is out of scope.
- No future mortality improvement. 2023 rates are applied to later calendar years.
- Education is a socioeconomic correlate, not a biological cause.
- Personalization, when released, is not an official SSA estimate.

## 6. Caps, errors, and model versions

| Condition | Behavior |
|---|---|
| Missing date of birth or unsupported sex | Omit that person's flags; do not remap sex |
| Current age outside 0–119 | Do not calculate a curve |
| Incomplete smoking/education/health answers | SSA population estimate |
| Missing or invalid NHIS artifact | Fail closed to SSA population estimate; diagnostic `INVALID_MORTALITY_MODEL` |
| Missing SSA age | Stop at the last supported age; no `p *= 0.3` fallback |
| Individual threshold past age 110 | Chip `110+`, pinned at the 110th-birthday year |
| Household threshold past the shared cap | Chip `Beyond {capYear}` |
| One valid spouse in a couple | Individual flags only; household row omitted |

Displayed timeline years always have matching `calculateProjection` data. The Go-Go/Slow-Go/No-Go bar remains 62–95. Unrelated calculator views keep the default `birthYear + 95` horizon unless they pass an explicit `endYear`.
