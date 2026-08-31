# NHIS Linked Mortality Cohort Boundary (v1)

This directory is the offline, R-only NHIS linked-mortality modeling pipeline.
It fits, temporally validates, calibrates to SSA 2023, and exports a versioned
runtime artifact. The application backend does not run this environment.

The locked version-one formula is a survey-weighted person-quarter complementary
log-log model with main effects only. Production coefficients are exported only
after temporal-validation gates pass. The 2010–2013 validation for
`nhis-lmf-2019-v1` is committed in `validation/temporal-validation-v1.json`.

## 2004 is excluded from configured cohorts

The official Person files resolve the demographic, education, health, and
survey-design gaps for 1997–2018. Official Person and Sample Adult identifiers
join one-to-one for every Sample Adult in all 22 years.

The official 2004 Person and Sample Adult SAS layouts contain no `INTV_QRT`
(and no interview month). The 2004 map therefore keeps
`interview_quarter: {source: null}` so the loader still rejects that year
instead of inventing a quarter. `config/cohorts.yml` omits 2004 from
`development` and `production_fit`. Cohort assembly also keeps only respondents
with `age_at_interview >= minimum_age` (60).

Mortality timing uses only documented `DODYEAR` and `DODQTR` values. Living
respondents are censored at 2019 Q4. No dates, person-month fields, or
fractional exposure are invented.

## Official sources verified

- NHIS 1997–2018 Person and Sample Adult files and annual SAS input programs:
  `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHIS/{year}/`
  and
  `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Program_Code/NHIS/{year}/`
  (the exact annual URLs, including the 2003 and 2004 exceptions, are committed
  in `config/variable-map.yml`).
- 2019 public-use linked mortality index:
  <https://www.cdc.gov/nchs/linked-data/mortality-files/index.html>
- Public-use 2019 LMF description:
  <https://www.cdc.gov/nchs/data/datalinkage/public-use-linked-mortality-file-description.pdf>
- Public-use 2019 LMF data dictionary:
  <https://www.cdc.gov/nchs/data/datalinkage/public-use-linked-mortality-files-data-dictionary.pdf>
- Official all-survey R input program:
  <https://ftp.cdc.gov/pub/Health_statistics/NCHS/datalinkage/linked_mortality/R_ReadInProgramAllSurveys.R>
- Annual NHIS LMF files:
  `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/datalinkage/linked_mortality/NHIS_{year}_MORT_2019_PUBLIC.dat`

Local official inputs and documentation belong under `raw/`; derived data
belongs under `interim/`. Both paths are gitignored.

## Reproducible environment

The lockfile targets R 4.5.1 and pins the complete CRAN dependency graph for
`survey`, `mice`, `mitools`, `haven`, `jsonlite`, `yaml`, `digest`, and
`testthat`.

```bash
cd modeling/longevity/nhis-v1
Rscript -e 'if (!requireNamespace("renv", quietly = TRUE)) install.packages("renv"); renv::restore()'
```

The application and production backend do not run this environment.

## Pipeline modules

- `R/load_inputs.R` validates maps, parses official SAS fixed-width layouts,
  reads both official NHIS components, and reads the exact 42-column NHIS LMF
  public-use layout.
- `R/harmonize.R` performs map-driven categorical recoding, rejects every
  observed unmapped source code, enforces a one-to-one Person/Sample Adult
  match on the official 14-character public identifier, and pools Sample Adult
  weights without dropping Person-file stratum or PSU.
- `R/impute.R` exposes an exactly-20-dataset `mice` boundary for development and
  production-fit records. Outcome, age, sex, year, weight, smoking, education,
  and health are included in the imputation model. Calibration and runtime
  records are rejected rather than imputed.
- `R/person_quarter.R` expands inclusive interview-to-exit quarter indices,
  marks death only in the documented death quarter, censors living respondents
  at 2019 Q4, and retains survey-design/profile fields.
- `R/fit_model.R` fits the locked cloglog formula on each imputation, pooling
  coefficients with Rubin's rules.
- `R/validate_model.R` scores the untouched development model on 2010–2013
  interviews at 4, 12, and 20 observed quarters.
- `R/calibrate_ssa.R` solves age/sex baseline hazards so weighted profile `qx`
  matches SSA `qx` within `1e-10`.
- `R/export_artifact.R` writes the runtime JSON from pipeline outputs.
- `run_pipeline.R` is the deterministic entry point.

```bash
Rscript run_pipeline.R \
  --cohorts config/cohorts.yml \
  --variables config/variable-map.yml \
  --ssa ../../../frontend/src/data/mortality/ssa-period-life-table-2023.json \
  --artifact ../../../frontend/src/data/mortality/nhis-personalization-v1.json \
  --validation validation/temporal-validation-v1.json
```

## Tests

With R available locally:

```bash
Rscript -e 'testthat::test_dir("tests/testthat")'
```

An equivalent isolated invocation is:

```bash
docker run --rm \
  -v "$PWD/../../..:/workspace" \
  -w /workspace/modeling/longevity/nhis-v1 \
  rocker/tidyverse:4.5.1 \
  Rscript -e 'testthat::test_dir("tests/testthat")'
```

The synthetic fixtures test strict component mapping, one-to-one joins, explicit
missingness, pooled annual weights, alive censoring, later-quarter death,
interview-quarter death, death-before-interview rejection, attained-age
advancement, and propagation of weights, strata, PSUs, and profile fields.
