source("R/load_inputs.R")
source("R/harmonize.R")
source("R/impute.R")
source("R/person_quarter.R")
source("R/fit_model.R")
source("R/validate_model.R")
source("R/calibrate_ssa.R")
source("R/export_artifact.R")

parse_cli_args <- function(args = commandArgs(trailingOnly = TRUE)) {
  defaults <- list(
    cohorts = "config/cohorts.yml",
    variables = "config/variable-map.yml",
    ssa = "../../../frontend/src/data/mortality/ssa-period-life-table-2023.json",
    artifact = "../../../frontend/src/data/mortality/nhis-personalization-v1.json",
    validation = "validation/temporal-validation-v1.json",
    raw = "raw/source"
  )
  if (length(args) == 0L) {
    return(defaults)
  }
  if (length(args) %% 2L != 0L) {
    stop("CLI arguments must be --key value pairs.", call. = FALSE)
  }
  keys <- sub("^--", "", args[c(TRUE, FALSE)])
  values <- args[c(FALSE, TRUE)]
  out <- defaults
  for (index in seq_along(keys)) {
    out[[keys[[index]]]] <- values[[index]]
  }
  out
}

is_pipeline_entrypoint <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  if (length(file_arg) == 0L) {
    return(FALSE)
  }
  grepl("run_pipeline\\.R$", sub("^--file=", "", file_arg[[1]]))
}

nhis_year_paths <- function(raw_root, year) {
  year_dir <- file.path(raw_root, "nhis", as.character(year))
  list(
    person = file.path(year_dir, "personsx.zip"),
    person_sas = file.path(year_dir, "PERSONSX.sas"),
    sample_adult = file.path(
      year_dir,
      if (as.integer(year) == 2003L) "SAMADULT.DAT" else "samadult.zip"
    ),
    sample_adult_sas = file.path(year_dir, "SAMADULT.sas"),
    lmf = file.path(raw_root, "lmf", sprintf("NHIS_%s_MORT_2019_PUBLIC.dat", year))
  )
}

load_harmonized_year <- function(year, variable_map, pool_year_count, raw_root) {
  if (identical(as.integer(year), 2004L)) {
    stop("2004 is excluded because official files have no interview quarter.", call. = FALSE)
  }
  paths <- nhis_year_paths(raw_root, year)
  inputs <- load_year_inputs(
    paths$person,
    paths$person_sas,
    paths$sample_adult,
    paths$sample_adult_sas,
    paths$lmf,
    variable_map,
    year
  )
  mapping <- get_year_mapping(variable_map, year)
  nhis <- harmonize_nhis(
    inputs$person,
    inputs$sample_adult,
    mapping,
    year,
    pool_year_count
  )
  mortality <- harmonize_lmf(inputs$mortality, variable_map$linked_mortality_2019)
  join_nhis_mortality(nhis, mortality)
}

eligible_mortality_records <- function(rows) {
  eligible <- !is.na(rows$mortality_eligibility) & rows$mortality_eligibility == "eligible"
  status_ok <- !is.na(rows$mortality_status) & rows$mortality_status %in% c(0L, 1L)
  rows[eligible & status_ok, , drop = FALSE]
}

assemble_cohort <- function(cohort, variable_map, raw_root, role, require_mortality = TRUE) {
  years <- as.integer(cohort$interview_years)
  if (2004L %in% years) {
    stop("2004 is excluded from configured cohorts.", call. = FALSE)
  }
  pool_year_count <- length(years)
  pieces <- lapply(years, function(year) {
    message("Loading NHIS ", year, " for ", role)
    rows <- load_harmonized_year(year, variable_map, pool_year_count, raw_root)
    rows <- select_cohort_respondents(rows, cohort)
    rows$cohort_role <- role
    rows
  })
  out <- do.call(rbind, pieces)
  if (isTRUE(require_mortality)) {
    out <- eligible_mortality_records(out)
  }
  out
}

cache_rds <- function(path, builder) {
  if (file.exists(path)) {
    message("Reusing cached ", path)
    return(readRDS(path))
  }
  value <- builder()
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  saveRDS(value, path)
  value
}

run_nhis_pipeline <- function(args = parse_cli_args()) {
  if (!requireNamespace("yaml", quietly = TRUE) || !requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Packages 'yaml' and 'jsonlite' are required to run the NHIS pipeline.", call. = FALSE)
  }

  cohort_config <- yaml::read_yaml(args$cohorts)
  variable_map <- read_variable_map(args$variables)
  ssa <- jsonlite::fromJSON(args$ssa, simplifyVector = TRUE)
  raw_root <- args$raw

  development <- cache_rds(
    "interim/development.rds",
    function() assemble_cohort(cohort_config$development, variable_map, raw_root, "development")
  )
  validation_records <- cache_rds(
    "interim/temporal_validation.rds",
    function() {
      assemble_cohort(
        cohort_config$temporal_validation,
        variable_map,
        raw_root,
        "temporal_validation"
      )
    }
  )
  production <- cache_rds(
    "interim/production_fit.rds",
    function() assemble_cohort(cohort_config$production_fit, variable_map, raw_root, "production_fit")
  )
  calibration_records <- cache_rds(
    "interim/calibration_target.rds",
    function() {
      assemble_cohort(
        cohort_config$calibration_target,
        variable_map,
        raw_root,
        "calibration_target",
        require_mortality = FALSE
      )
    }
  )

  message("Imputing development covariates")
  development_mice <- cache_rds(
    "interim/development_mice.rds",
    function() impute_model_development(development)
  )
  message("Fitting locked development model")
  development_model <- cache_rds(
    "interim/development_model.rds",
    function() fit_locked_imputed_model(development, development_mice)
  )

  message("Running temporal validation on 2010-2013 interviews")
  validation <- evaluate_temporal_validation(
    validation_records,
    development_model,
    cohort_config$temporal_validation$interview_years
  )
  write_json_artifact(validation, args$validation)
  assert_validation_gates(validation)

  message("Imputing production-fit covariates")
  production_mice <- cache_rds(
    "interim/production_mice.rds",
    function() impute_production_fit(production)
  )
  message("Refitting locked formula on 1997-2013 production cohort")
  production_model <- cache_rds(
    "interim/production_model.rds",
    function() fit_locked_imputed_model(production, production_mice)
  )

  coefficients <- extract_profile_coefficients(production_model$coefficients)
  distributions <- build_calibration_distributions(calibration_records)
  lambdas <- solve_all_lambdas(ssa, distributions, coefficients)
  artifact <- build_nhis_artifact(
    runMetadata = list(
      sourceUrls = collect_source_urls(variable_map, cohort_config, ssa),
      fitDate = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
      softwareVersions = collect_software_versions()
    ),
    cohortConfig = cohort_config,
    exportedProfileCoefficients = coefficients,
    exportedProfileDistributions = export_profile_distributions(distributions),
    exportedLambdas = lambdas,
    temporalValidation = validation
  )
  write_json_artifact(artifact, args$artifact)
  message("Wrote ", args$validation)
  message("Wrote ", args$artifact)
  invisible(artifact)
}

if (is_pipeline_entrypoint()) {
  run_nhis_pipeline()
}
