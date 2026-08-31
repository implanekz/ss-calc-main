library(testthat)

source(test_path("..", "..", "R", "export_artifact.R"))

synthetic_run_metadata <- function() {
  list(
    sourceUrls = c(
      "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHIS/1997/personsx.zip",
      "https://www.ssa.gov/oact/STATS/table4c6.html"
    ),
    fitDate = "2026-08-31",
    softwareVersions = list(R = "R version 4.5.1", survey = "4.4-2", mice = "3.18.0")
  )
}

synthetic_cohorts <- function() {
  list(
    development = list(interview_years = c(1997, 1998), minimum_age = 60),
    temporal_validation = list(interview_years = c(2010, 2011, 2012, 2013), minimum_age = 60),
    production_fit = list(interview_years = c(1997, 1998, 2010), minimum_age = 60),
    calibration_target = list(
      interview_years = c(2015, 2016, 2017, 2018),
      minimum_age = 60,
      age_bands = c("60-69", "70-79", "80+")
    )
  )
}

synthetic_coefficients <- function() {
  list(
    smoking = list(former = 0.21, current = 0.54),
    education = list(some = 0.11, high_school = 0.29),
    health = list(good = 0.16, fair = 0.41)
  )
}

synthetic_distributions <- function() {
  profiles <- list(
    list(smoking = "never", education = "college", health = "excellent", weight = 0.4),
    list(smoking = "current", education = "high_school", health = "fair", weight = 0.6)
  )
  bands <- list("60-69" = profiles, "70-79" = profiles, "80+" = profiles)
  list(male = bands, female = bands)
}

synthetic_lambdas <- function() {
  ages <- as.character(60:119)
  values <- as.list(seq(0.01, 0.4, length.out = length(ages)))
  names(values) <- ages
  list(male = values, female = values)
}

synthetic_validation <- function() {
  horizon <- function(quarters) {
    list(
      observedQuarters = quarters,
      n = 1000,
      deaths = 120,
      observedMortality = 0.12,
      predictedMortality = 0.11,
      error = 0.01,
      brier = 0.09,
      calibrationInTheLarge = 0.008,
      calibrationSlope = 1.02,
      subgroups = list()
    )
  }
  list(
    modelVersion = "nhis-lmf-2019-v1",
    interviewYears = c(2010, 2011, 2012, 2013),
    horizons = list("4" = horizon(4), "12" = horizon(12), "20" = horizon(20)),
    gates = list(
      overallErrorMax = 0.02,
      subgroupErrorMax = 0.03,
      subgroupDeathsMin = 100,
      calibrationSlopeMin = 0.8,
      calibrationSlopeMax = 1.2,
      passed = TRUE
    )
  )
}

test_that("artifact builder populates required fields from the pipeline run", {
  artifact <- build_nhis_artifact(
    runMetadata = synthetic_run_metadata(),
    cohortConfig = synthetic_cohorts(),
    exportedProfileCoefficients = synthetic_coefficients(),
    exportedProfileDistributions = synthetic_distributions(),
    exportedLambdas = synthetic_lambdas(),
    temporalValidation = synthetic_validation()
  )

  expect_identical(artifact$schemaVersion, 1L)
  expect_identical(artifact$artifactType, "nhis-linked-mortality-personalization")
  expect_identical(artifact$modelVersion, "nhis-lmf-2019-v1")
  expect_identical(artifact$sourceUrls, synthetic_run_metadata()$sourceUrls)
  expect_identical(artifact$cohorts, synthetic_cohorts())
  expect_identical(artifact$fitDate, "2026-08-31")
  expect_identical(artifact$softwareVersions, synthetic_run_metadata()$softwareVersions)
  expect_identical(
    artifact$referenceCategories,
    list(smoking = "never", education = "college", health = "excellent")
  )
  expect_identical(artifact$coefficients, synthetic_coefficients())
  expect_identical(artifact$calibrationProfileDistributions, synthetic_distributions())
  expect_identical(artifact$lambdaBySexAndAge, synthetic_lambdas())
  expect_identical(artifact$validation, synthetic_validation())
})

test_that("artifact schema rejects missing runtime fields", {
  artifact <- build_nhis_artifact(
    runMetadata = synthetic_run_metadata(),
    cohortConfig = synthetic_cohorts(),
    exportedProfileCoefficients = synthetic_coefficients(),
    exportedProfileDistributions = synthetic_distributions(),
    exportedLambdas = synthetic_lambdas(),
    temporalValidation = synthetic_validation()
  )
  artifact$coefficients <- NULL
  expect_error(validate_nhis_artifact(artifact), "coefficients")
})

test_that("exported artifact file has generated coefficients, lambdas, and validation", {
  artifact_path <- test_path(
    "..", "..", "..", "..", "..",
    "frontend", "src", "data", "mortality", "nhis-personalization-v1.json"
  )
  skip_if_not(file.exists(artifact_path))
  skip_if_not_installed("jsonlite")

  artifact <- jsonlite::fromJSON(artifact_path, simplifyVector = FALSE)
  validate_nhis_artifact(artifact)

  expect_identical(artifact$schemaVersion, 1L)
  expect_identical(artifact$artifactType, "nhis-linked-mortality-personalization")
  expect_identical(artifact$modelVersion, "nhis-lmf-2019-v1")
  expect_true(length(artifact$sourceUrls) >= 1L)
  expect_false(identical(artifact$coefficients$smoking$current, 0))
  expect_true(is.numeric(artifact$coefficients$smoking$current))
  expect_true(is.numeric(artifact$coefficients$education$high_school))
  expect_true(is.numeric(artifact$coefficients$health$fair))
  expect_identical(artifact$referenceCategories$smoking, "never")
  expect_identical(artifact$referenceCategories$education, "college")
  expect_identical(artifact$referenceCategories$health, "excellent")

  for (sex in c("male", "female")) {
    lambdas <- artifact$lambdaBySexAndAge[[sex]]
    expect_identical(names(lambdas), as.character(60:119))
    expect_true(all(vapply(lambdas, is.numeric, logical(1))))
    for (band in c("60-69", "70-79", "80+")) {
      dist <- artifact$calibrationProfileDistributions[[sex]][[band]]
      expect_true(length(dist) >= 1L)
      weights <- vapply(dist, function(row) row$weight, numeric(1))
      expect_lt(abs(sum(weights) - 1), 1e-8)
    }
  }

  expect_true(artifact$validation$gates$passed)
  expect_identical(names(artifact$validation$horizons), c("4", "12", "20"))
  expect_true(nzchar(artifact$fitDate))
  expect_true(nzchar(artifact$softwareVersions$R))
})
