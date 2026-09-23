locked_model_formula <- function() {
  event ~ factor(attained_age) + sex + smoking + education +
    self_rated_health + I(survey_year - 2014)
}

profile_factor_levels <- function() {
  list(
    sex = c("male", "female"),
    smoking = c("never", "former", "current"),
    education = c("college", "some", "high_school"),
    self_rated_health = c("excellent", "good", "fair")
  )
}

prepare_model_frame <- function(rows) {
  levels <- profile_factor_levels()
  rows$sex <- factor(as.character(rows$sex), levels = levels$sex)
  rows$smoking <- factor(as.character(rows$smoking), levels = levels$smoking)
  rows$education <- factor(as.character(rows$education), levels = levels$education)
  rows$self_rated_health <- factor(
    as.character(rows$self_rated_health),
    levels = levels$self_rated_health
  )
  rows$attained_age <- as.integer(rows$attained_age)
  rows$survey_year <- as.integer(rows$survey_year)
  if ("event" %in% names(rows)) {
    rows$event <- as.numeric(rows$event)
  }
  rows
}

person_quarter_survey_design <- function(rows) {
  if (!requireNamespace("survey", quietly = TRUE)) {
    stop("Package 'survey' is required for survey-weighted model fits.", call. = FALSE)
  }
  options(survey.lonely.psu = "adjust")
  if (!"design_stratum" %in% names(rows)) {
    rows$design_stratum <- factor(paste(rows$survey_year, rows$stratum, sep = ":"))
  }
  rows$psu <- factor(as.character(rows$psu))
  survey::svydesign(
    ids = ~psu,
    strata = ~design_stratum,
    weights = ~pooled_weight,
    nest = TRUE,
    data = rows
  )
}

aggregate_person_quarter_cells <- function(person_quarters) {
  person_quarters$design_stratum <- factor(
    paste(person_quarters$survey_year, person_quarters$stratum, sep = ":")
  )
  person_quarters$psu <- factor(as.character(person_quarters$psu))
  aggregated <- stats::aggregate(
    cbind(
      event_weight = as.numeric(person_quarters$event) * person_quarters$pooled_weight,
      pooled_weight = person_quarters$pooled_weight
    ),
    by = list(
      attained_age = person_quarters$attained_age,
      sex = person_quarters$sex,
      smoking = person_quarters$smoking,
      education = person_quarters$education,
      self_rated_health = person_quarters$self_rated_health,
      survey_year = person_quarters$survey_year,
      design_stratum = person_quarters$design_stratum,
      psu = person_quarters$psu
    ),
    FUN = sum
  )
  aggregated$event <- aggregated$event_weight / aggregated$pooled_weight
  prepare_model_frame(aggregated)
}

apply_imputation <- function(records, imputed_slice) {
  out <- records
  for (name in c("smoking", "education", "self_rated_health")) {
    out[[name]] <- as.character(imputed_slice[[name]])
  }
  out
}

model_fit_columns <- function() {
  c(
    "event", "attained_age", "sex", "smoking", "education",
    "self_rated_health", "survey_year", "pooled_weight", "stratum", "psu"
  )
}

pool_coefficient_list <- function(coef_list, vcov_list) {
  names_union <- names(coef_list[[1]])
  aligned <- lapply(coef_list, function(beta) {
    missing <- setdiff(names_union, names(beta))
    extra <- setdiff(names(beta), names_union)
    if (length(missing) > 0L || length(extra) > 0L) {
      stop("Imputed model coefficient names do not match across datasets.", call. = FALSE)
    }
    beta[names_union]
  })
  estimates <- do.call(rbind, aligned)
  q_bar <- colMeans(estimates)
  u_bar <- Reduce(`+`, lapply(vcov_list, function(vcov_i) {
    vcov_i[names_union, names_union, drop = FALSE]
  })) / length(vcov_list)
  b <- stats::cov(estimates)
  list(
    coefficients = q_bar,
    vcov = u_bar + (1 + 1 / length(coef_list)) * b
  )
}

fit_one_imputation <- function(records, imputed_slice) {
  imputed <- apply_imputation(records, imputed_slice)
  person_quarters <- expand_person_quarter_dataset(imputed)
  person_quarters <- person_quarters[, model_fit_columns(), drop = FALSE]
  person_quarters <- prepare_model_frame(person_quarters)
  cells <- aggregate_person_quarter_cells(person_quarters)
  rm(person_quarters, imputed)
  gc()
  design <- person_quarter_survey_design(cells)
  survey::svyglm(
    locked_model_formula(),
    design = design,
    family = quasibinomial(link = "cloglog")
  )
}

fit_locked_imputed_model <- function(records, mice_obj, progress = TRUE) {
  m <- as.integer(mice_obj$m)
  coef_list <- vector("list", m)
  vcov_list <- vector("list", m)
  template <- NULL
  for (index in seq_len(m)) {
    if (isTRUE(progress)) {
      message(sprintf("Fitting cloglog imputation %s of %s", index, m))
    }
    fit <- fit_one_imputation(records, mice::complete(mice_obj, index))
    coef_list[[index]] <- stats::coef(fit)
    vcov_list[[index]] <- stats::vcov(fit)
    if (index == 1L) {
      template <- list(
        terms = stats::terms(fit),
        xlevels = fit$xlevels,
        contrasts = fit$contrasts
      )
      message(
        "Profile coefficients: ",
        paste(grep("smoking|education|self_rated", names(stats::coef(fit)), value = TRUE), collapse = ", ")
      )
    }
    rm(fit)
    gc()
  }
  pooled <- pool_coefficient_list(coef_list, vcov_list)
  list(
    coefficients = pooled$coefficients,
    vcov = pooled$vcov,
    terms = template$terms,
    xlevels = template$xlevels,
    contrasts = template$contrasts
  )
}

extract_profile_coefficients <- function(beta) {
  beta <- unlist(beta)
  required <- c(
    smokingformer = "smokingformer",
    smokingcurrent = "smokingcurrent",
    educationsome = "educationsome",
    educationhigh_school = "educationhigh_school",
    self_rated_healthgood = "self_rated_healthgood",
    self_rated_healthfair = "self_rated_healthfair"
  )
  missing <- setdiff(unname(required), names(beta))
  if (length(missing) > 0L) {
    stop(
      sprintf("Pooled model is missing profile coefficients: %s", paste(missing, collapse = ", ")),
      call. = FALSE
    )
  }
  list(
    smoking = list(
      former = unname(beta[["smokingformer"]]),
      current = unname(beta[["smokingcurrent"]])
    ),
    education = list(
      some = unname(beta[["educationsome"]]),
      high_school = unname(beta[["educationhigh_school"]])
    ),
    health = list(
      good = unname(beta[["self_rated_healthgood"]]),
      fair = unname(beta[["self_rated_healthfair"]])
    )
  )
}

complete_profile_records <- function(records) {
  records[
    !is.na(records$smoking) &
      !is.na(records$education) &
      !is.na(records$self_rated_health) &
      !is.na(records$sex),
    ,
    drop = FALSE
  ]
}
