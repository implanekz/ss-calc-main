# NHIS Linked Mortality Cohort Boundary (v1)

This directory is the offline, R-only data-engineering boundary for a future
NHIS linked-mortality model. It does not fit or export production coefficients,
and it adds no R dependency to the application backend.

## Current status: blocked on the authorized source set

The pipeline infrastructure and synthetic tests are independently usable, but
the requested canonical cohort cannot be built from **only** the official
public-use NHIS Sample Adult files and the 2019 public-use NHIS Linked Mortality
Files:

- Self-rated health is absent from every 1997–2018 Sample Adult SAS layout.
- Education is present in the Sample Adult layouts for 1997–2003 and absent for
  2004–2018.
- The 2004 Sample Adult layout also omits age, sex, stratum, and PSU.
- The official 2019 public-use **NHIS** LMF layout has no person-month follow-up
  field. `PERMTH_INT` and `PERMTH_EXM` are in the NHANES layout, not the NHIS
  layout.

`config/variable-map.yml` records verified raw names and codes where they exist,
uses explicit `null` values where they do not, and marks every annual cohort and
the mortality mapping as blocked. `validate_year_mapping()` and
`validate_lmf_mapping()` fail before reading data, so missing fields cannot be
silently guessed or borrowed from an unauthorized component file.

Resolving the boundary requires a reviewed source-scope change (most likely the
official NHIS Person file for demographic, education, health, and design
variables) plus a documented, approved follow-up derivation from the public-use
death year/quarter fields, or a different authorized mortality release that
contains follow-up duration. Do not remove the guards until that decision is
made.

## Official sources verified

- NHIS 1997–2018 Sample Adult files and annual SAS input programs:
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
  reads official ASCII/ZIP inputs, and reads the exact 42-column NHIS LMF
  public-use layout.
- `R/harmonize.R` performs map-driven categorical recoding, rejects every
  observed unmapped source code, builds the 14-character public identifier, and
  pools annual weights without dropping stratum or PSU.
- `R/impute.R` exposes a model-development-only, exactly-20-dataset `mice`
  boundary. Outcome, age, sex, year, weight, smoking, education, and health are
  included in the imputation model. Calibration and runtime records are
  rejected rather than imputed.
- `R/person_year.R` expands records after delayed entry at age 60, retaining
  fractional exposure and all survey-design/profile fields.

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

The synthetic fixtures test strict category mapping, explicit missingness,
pooled annual weights, delayed entry before age 60, censoring, death, fractional
first/final intervals, exact-birthday death, zero follow-up, and propagation of
weights, strata, and PSUs.
