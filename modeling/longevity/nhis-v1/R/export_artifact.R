NHIS_ARTIFACT_TYPE <- "nhis-linked-mortality-personalization"
NHIS_MODEL_VERSION <- "nhis-lmf-2019-v1"

required_artifact_fields <- function() {
  c(
    "schemaVersion", "artifactType", "modelVersion", "sourceUrls", "cohorts",
    "fitDate", "softwareVersions", "referenceCategories", "coefficients",
    "calibrationProfileDistributions", "lambdaBySexAndAge", "validation"
  )
}

build_nhis_artifact <- function(
    runMetadata,
    cohortConfig,
    exportedProfileCoefficients,
    exportedProfileDistributions,
    exportedLambdas,
    temporalValidation) {
  artifact <- list(
    schemaVersion = 1L,
    artifactType = NHIS_ARTIFACT_TYPE,
    modelVersion = NHIS_MODEL_VERSION,
    sourceUrls = runMetadata$sourceUrls,
    cohorts = cohortConfig,
    fitDate = runMetadata$fitDate,
    softwareVersions = runMetadata$softwareVersions,
    referenceCategories = list(
      smoking = "never",
      education = "college",
      health = "excellent"
    ),
    coefficients = exportedProfileCoefficients,
    calibrationProfileDistributions = exportedProfileDistributions,
    lambdaBySexAndAge = exportedLambdas,
    validation = temporalValidation
  )
  validate_nhis_artifact(artifact)
  artifact
}

validate_nhis_artifact <- function(artifact) {
  missing <- setdiff(required_artifact_fields(), names(artifact))
  if (length(missing) > 0L) {
    stop(sprintf("Artifact is missing: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }
  if (!identical(as.integer(artifact$schemaVersion), 1L)) {
    stop("schemaVersion must be 1.", call. = FALSE)
  }
  if (!identical(artifact$artifactType, NHIS_ARTIFACT_TYPE)) {
    stop("Unexpected artifactType.", call. = FALSE)
  }
  if (!identical(artifact$modelVersion, NHIS_MODEL_VERSION)) {
    stop("Unexpected modelVersion.", call. = FALSE)
  }
  refs <- artifact$referenceCategories
  if (
    !identical(refs$smoking, "never") ||
      !identical(refs$education, "college") ||
      !identical(refs$health, "excellent")
  ) {
    stop("referenceCategories must be never / college / excellent.", call. = FALSE)
  }
  for (predictor in c("smoking", "education", "health")) {
    if (is.null(artifact$coefficients[[predictor]])) {
      stop(sprintf("Artifact is missing %s coefficients.", predictor), call. = FALSE)
    }
  }
  for (sex in c("male", "female")) {
    lambdas <- artifact$lambdaBySexAndAge[[sex]]
    if (is.null(lambdas) || !identical(names(lambdas), as.character(60:119))) {
      stop(sprintf("%s lambdas must cover ages 60-119.", sex), call. = FALSE)
    }
    for (band in c("60-69", "70-79", "80+")) {
      if (is.null(artifact$calibrationProfileDistributions[[sex]][[band]])) {
        stop(sprintf("Missing calibration distribution for %s %s.", sex, band), call. = FALSE)
      }
    }
  }
  invisible(artifact)
}

write_json_artifact <- function(object, path) {
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' is required to write model artifacts.", call. = FALSE)
  }
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(
    object,
    path,
    auto_unbox = TRUE,
    pretty = TRUE,
    digits = 16,
    na = "null"
  )
  path
}

collect_software_versions <- function() {
  packages <- c("survey", "mice", "mitools", "haven", "jsonlite", "yaml", "digest")
  versions <- lapply(packages, function(package) {
    if (requireNamespace(package, quietly = TRUE)) {
      as.character(utils::packageVersion(package))
    } else {
      NULL
    }
  })
  names(versions) <- packages
  versions <- versions[!vapply(versions, is.null, logical(1))]
  c(list(R = R.version$version.string), versions)
}

collect_source_urls <- function(variable_map, cohort_config, ssa_artifact) {
  years <- sort(unique(as.integer(unlist(
    lapply(
      cohort_config[c("development", "temporal_validation", "production_fit", "calibration_target")],
      function(cohort) cohort$interview_years
    ),
    use.names = FALSE
  ))))
  urls <- character()
  for (year in years) {
    mapping <- variable_map$nhis[[as.character(year)]]
    urls <- c(
      urls,
      mapping$person$data_url,
      mapping$person$sas_url,
      mapping$sample_adult$data_url,
      mapping$sample_adult$sas_url
    )
  }
  lmf <- variable_map$linked_mortality_2019
  template <- gsub("{year}", "%s", lmf$data_url_template, fixed = TRUE)
  urls <- c(
    urls,
    lmf$index_url,
    lmf$description_url,
    lmf$dictionary_url,
    lmf$read_program_url,
    sprintf(template, years)
  )
  if (!is.null(ssa_artifact$sourceUrl)) {
    urls <- c(urls, ssa_artifact$sourceUrl)
  }
  unique(urls[!is.na(urls) & nzchar(as.character(urls))])
}
