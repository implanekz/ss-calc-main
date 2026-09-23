imputation_model_columns <- function() {
  c(
    "mortality_status", "age_at_interview", "sex", "survey_year",
    "pooled_weight", "smoking", "education", "self_rated_health"
  )
}

assert_imputation_roles <- function(records, allowed_roles, error_prefix) {
  if (!"cohort_role" %in% names(records)) {
    stop("Records must include cohort_role.", call. = FALSE)
  }
  invalid <- unique(as.character(records$cohort_role[!records$cohort_role %in% allowed_roles]))
  if (length(invalid) > 0L) {
    stop(paste0(error_prefix, paste(invalid, collapse = ", ")), call. = FALSE)
  }
  invisible(records)
}

assert_model_development_records <- function(records) {
  assert_imputation_roles(
    records,
    allowed_roles = "development",
    error_prefix = "Imputation is restricted to model-development records; received: "
  )
}

impute_model_records <- function(
    records,
    m = 20L,
    seed = 20260831L,
    maxit = 20L,
    allowed_roles = "development",
    role_error = "Imputation is restricted to model-development records; received: ") {
  assert_imputation_roles(records, allowed_roles, role_error)
  impute_locked_covariates(records, m = m, seed = seed, maxit = maxit)
}

impute_locked_covariates <- function(records, m = 20L, seed = 20260831L, maxit = 20L) {
  if (!requireNamespace("mice", quietly = TRUE)) {
    stop("Package 'mice' is required for model-development imputation.", call. = FALSE)
  }
  if (!identical(as.integer(m), 20L)) {
    stop("The locked pipeline requires exactly 20 imputed datasets.", call. = FALSE)
  }
  message(sprintf("Running mice m=20 maxit=%s on %s records", maxit, nrow(records)))

  columns <- imputation_model_columns()
  missing <- setdiff(columns, names(records))
  if (length(missing) > 0L) {
    stop(sprintf("Imputation input is missing: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }

  model_data <- records[, columns, drop = FALSE]
  for (name in c("sex", "smoking", "education", "self_rated_health")) {
    model_data[[name]] <- factor(model_data[[name]])
  }

  fixed <- c("mortality_status", "age_at_interview", "sex", "survey_year", "pooled_weight")
  if (anyNA(model_data[, fixed, drop = FALSE])) {
    stop("Outcome, age, sex, survey year, and pooled weight must be observed before imputation.", call. = FALSE)
  }

  methods <- mice::make.method(model_data)
  methods[] <- ""
  for (name in c("smoking", "education", "self_rated_health")) {
    if (anyNA(model_data[[name]])) {
      methods[[name]] <- "polyreg"
    }
  }

  predictors <- mice::make.predictorMatrix(model_data)
  diag(predictors) <- 0L
  predictors[, columns] <- 1L
  diag(predictors) <- 0L

  mice::mice(
    model_data,
    m = 20L,
    maxit = as.integer(maxit),
    method = methods,
    predictorMatrix = predictors,
    seed = as.integer(seed),
    printFlag = FALSE
  )
}

impute_model_development <- function(records, m = 20L, seed = 20260831L, maxit = 20L) {
  impute_model_records(
    records,
    m = m,
    seed = seed,
    maxit = maxit,
    allowed_roles = "development",
    role_error = "Imputation is restricted to model-development records; received: "
  )
}

impute_production_fit <- function(records, m = 20L, seed = 20260831L, maxit = 20L) {
  impute_model_records(
    records,
    m = m,
    seed = seed,
    maxit = maxit,
    allowed_roles = "production_fit",
    role_error = "Production-fit imputation received unexpected cohort_role: "
  )
}
