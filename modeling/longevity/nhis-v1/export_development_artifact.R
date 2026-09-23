# Export a runtime artifact from the cached 1997–2009 development fit.
# Temporal-validation gates failed (calibration slope ~1.26–1.29). This is not
# a release artifact; the UI must disclose that.

source("R/load_inputs.R")
source("R/fit_model.R")
source("R/calibrate_ssa.R")
source("R/export_artifact.R")

args <- list(
  cohorts = "config/cohorts.yml",
  variables = "config/variable-map.yml",
  ssa = "../../../frontend/src/data/mortality/ssa-period-life-table-2023.json",
  artifact = "../../../frontend/src/data/mortality/nhis-personalization-v1.json",
  validation = "validation/temporal-validation-v1.json"
)

if (!file.exists("interim/development_model.rds")) {
  stop("Missing interim/development_model.rds.", call. = FALSE)
}
if (!file.exists("interim/calibration_target.rds")) {
  stop("Missing interim/calibration_target.rds.", call. = FALSE)
}

development_model <- readRDS("interim/development_model.rds")
calibration_records <- readRDS("interim/calibration_target.rds")
ssa <- jsonlite::fromJSON(args$ssa, simplifyVector = TRUE)
validation <- jsonlite::fromJSON(args$validation, simplifyVector = FALSE)
cohort_config <- yaml::read_yaml(args$cohorts)
variable_map <- read_variable_map(args$variables)

coefficients <- extract_profile_coefficients(development_model$coefficients)
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

if (isTRUE(artifact$validation$gates$passed)) {
  stop("Expected development validation gates to have failed.", call. = FALSE)
}

write_json_artifact(artifact, args$artifact)
message("Wrote development artifact ", args$artifact)
message(
  "Coefficients: smoking.current=",
  artifact$coefficients$smoking$current,
  " education.high_school=",
  artifact$coefficients$education$high_school,
  " health.fair=",
  artifact$coefficients$health$fair
)
invisible(artifact)
