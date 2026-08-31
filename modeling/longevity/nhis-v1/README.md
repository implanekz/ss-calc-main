# NHIS Linked Mortality Cohort Boundary (v1)

This directory is the offline, R-only data-engineering boundary for a future
NHIS linked-mortality model. It does not fit or export production coefficients,
and it adds no R dependency to the application backend.

## Current status: blocked for the 2004 cohort

The official Person files resolve the demographic, education, health, and
survey-design gaps for 1997–2018. Official Person and Sample Adult identifiers
join one-to-one for every Sample Adult in all 22 years, and 21 annual mappings
produce canonical records.

The official public-use 2004 Person and Sample Adult files contain no interview
quarter or interview month. Because a quarter cannot be inferred from the
documented public fields, the 2004 mapping remains explicitly blocked. The
development and production-fit cohort configurations include 2004, so those
full configured cohorts must not be built until an official quarter source is
authorized or 2004 is explicitly removed by a future design decision.

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
- `R/impute.R` exposes a model-development-only, exactly-20-dataset `mice`
  boundary. Outcome, age, sex, year, weight, smoking, education, and health are
  included in the imputation model. Calibration and runtime records are
  rejected rather than imputed.
- `R/person_quarter.R` expands inclusive interview-to-exit quarter indices,
  marks death only in the documented death quarter, censors living respondents
  at 2019 Q4, and retains survey-design/profile fields.

No model fit, coefficient, calibration table, or runtime artifact is produced
by this task.

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
