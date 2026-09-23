VALIDATION_HORIZONS <- c(4L, 12L, 20L)
SUBGROUP_DEATHS_MIN <- 100L
OVERALL_ERROR_MAX <- 0.02
SUBGROUP_ERROR_MAX <- 0.03
CALIBRATION_SLOPE_MIN <- 0.80
CALIBRATION_SLOPE_MAX <- 1.20

predict_cloglog_probability <- function(newdata, model) {
  newdata <- prepare_model_frame(newdata)
  age_levels <- model$xlevels[["factor(attained_age)"]]
  if (is.null(age_levels)) {
    age_levels <- model$xlevels$attained_age
  }
  if (is.null(age_levels)) {
    stop("Development model is missing attained-age levels.", call. = FALSE)
  }
  newdata$attained_age <- factor(newdata$attained_age, levels = age_levels)
  if (anyNA(newdata$attained_age)) {
    stop("Validation data contains attained ages absent from the development model.", call. = FALSE)
  }

  mm <- stats::model.matrix(stats::delete.response(model$terms), newdata)
  beta <- model$coefficients
  missing_coef <- setdiff(names(beta), colnames(mm))
  if (length(missing_coef) > 0L) {
    extra <- matrix(0, nrow = nrow(mm), ncol = length(missing_coef))
    colnames(extra) <- missing_coef
    mm <- cbind(mm, extra)
  }
  mm <- mm[, names(beta), drop = FALSE]
  linear_predictor <- as.numeric(mm %*% beta)
  pmin(pmax(1 - exp(-exp(linear_predictor)), 0), 1 - 1e-15)
}

build_horizon_quarters <- function(records, horizon) {
  horizon <- as.integer(horizon)
  n <- nrow(records)
  idx <- rep(seq_len(n), each = horizon)
  offset <- rep.int(seq.int(0L, horizon - 1L), n)
  out <- records[idx, , drop = FALSE]
  out$quarters_since_interview <- as.integer(offset)
  out$attained_age <- as.integer(records$age_at_interview[idx]) + as.integer(floor(offset / 4))
  out$event <- 0L
  rownames(out) <- NULL
  out
}

horizon_observed <- function(records, horizon) {
  entry <- quarter_index(records$survey_year, records$interview_quarter)
  deceased <- as.integer(records$mortality_status) == 1L
  exit <- rep.int(quarter_index(2019L, 4L), nrow(records))
  if (any(deceased)) {
    exit[deceased] <- quarter_index(records$death_year[deceased], records$death_quarter[deceased])
  }
  list(
    observed = as.integer(deceased & (exit - entry) < horizon),
    evaluable = (exit - entry + 1L) >= horizon | deceased
  )
}

weighted_calibration_metrics <- function(observed, predicted, weights) {
  keep <- is.finite(observed) & is.finite(predicted) & is.finite(weights) & weights > 0
  y <- as.numeric(observed[keep])
  p <- as.numeric(predicted[keep])
  w <- as.numeric(weights[keep])
  w <- w / mean(w)
  observed_mortality <- stats::weighted.mean(y, w)
  predicted_mortality <- stats::weighted.mean(p, w)
  clipped <- pmin(pmax(p, 1e-12), 1 - 1e-12)
  cloglog <- log(-log(1 - clipped))
  citl <- stats::glm(
    y ~ 1,
    family = stats::binomial(),
    offset = cloglog,
    weights = w
  )
  slope <- stats::glm(
    y ~ cloglog,
    family = stats::binomial(),
    weights = w
  )
  list(
    n = length(y),
    deaths = as.integer(round(sum(y))),
    observedMortality = observed_mortality,
    predictedMortality = predicted_mortality,
    error = observed_mortality - predicted_mortality,
    brier = stats::weighted.mean((y - p)^2, w),
    calibrationInTheLarge = unname(stats::coef(citl)[[1]]),
    calibrationSlope = unname(stats::coef(slope)[[2]])
  )
}

evaluate_subgroups <- function(records, observed, predicted, weights) {
  records$age_band <- calibration_age_band(records$age_at_interview)
  groupings <- list(
    sex = as.character(records$sex),
    age_band = as.character(records$age_band),
    smoking = as.character(records$smoking),
    education = as.character(records$education),
    health = as.character(records$self_rated_health)
  )
  unlist(lapply(names(groupings), function(variable) {
    values <- groupings[[variable]]
    lapply(sort(unique(values[!is.na(values)])), function(level) {
      keep <- !is.na(values) & values == level
      metrics <- weighted_calibration_metrics(observed[keep], predicted[keep], weights[keep])
      list(
        variable = variable,
        level = level,
        n = metrics$n,
        deaths = metrics$deaths,
        observedMortality = metrics$observedMortality,
        predictedMortality = metrics$predictedMortality,
        error = metrics$error,
        gated = metrics$deaths >= SUBGROUP_DEATHS_MIN
      )
    })
  }), recursive = FALSE, use.names = FALSE)
}

evaluate_horizon <- function(records, model, horizon) {
  status <- horizon_observed(records, horizon)
  keep <- status$evaluable
  kept <- records[keep, , drop = FALSE]
  quarters <- build_horizon_quarters(kept, horizon)
  p_quarter <- predict_cloglog_probability(quarters, model)
  person_index <- rep(seq_len(nrow(kept)), each = horizon)
  log_survival <- as.numeric(rowsum(log(pmax(1 - p_quarter, 1e-15)), person_index, reorder = FALSE))
  predicted <- 1 - exp(log_survival)
  observed <- status$observed[keep]
  weights <- as.numeric(kept$pooled_weight)
  overall <- weighted_calibration_metrics(observed, predicted, weights)
  overall$observedQuarters <- as.integer(horizon)
  overall$subgroups <- evaluate_subgroups(kept, observed, predicted, weights)
  overall
}

evaluate_temporal_validation <- function(records, model, interview_years) {
  records <- complete_profile_records(records)
  if (nrow(records) == 0L) {
    stop("Temporal validation cohort has no complete-profile respondents.", call. = FALSE)
  }
  horizons <- lapply(VALIDATION_HORIZONS, function(horizon) {
    message("Evaluating temporal validation at ", horizon, " observed quarters")
    evaluate_horizon(records, model, horizon)
  })
  names(horizons) <- as.character(VALIDATION_HORIZONS)
  validation <- list(
    modelVersion = "nhis-lmf-2019-v1",
    interviewYears = as.integer(interview_years),
    horizons = horizons,
    gates = list(
      overallErrorMax = OVERALL_ERROR_MAX,
      subgroupErrorMax = SUBGROUP_ERROR_MAX,
      subgroupDeathsMin = SUBGROUP_DEATHS_MIN,
      calibrationSlopeMin = CALIBRATION_SLOPE_MIN,
      calibrationSlopeMax = CALIBRATION_SLOPE_MAX,
      passed = NA
    )
  )
  validation$gates$passed <- tryCatch({
    assert_validation_gates(validation)
    TRUE
  }, error = function(e) FALSE)
  validation
}

assert_validation_gates <- function(validation) {
  for (name in as.character(VALIDATION_HORIZONS)) {
    horizon <- validation$horizons[[name]]
    if (is.null(horizon)) {
      stop(sprintf("Missing validation horizon %s.", name), call. = FALSE)
    }
    if (!is.finite(horizon$error) || abs(horizon$error) > OVERALL_ERROR_MAX) {
      stop(
        sprintf("Horizon %s overall mortality error %s exceeds 0.02.", name, horizon$error),
        call. = FALSE
      )
    }
    if (
      !is.finite(horizon$calibrationSlope) ||
        horizon$calibrationSlope < CALIBRATION_SLOPE_MIN ||
        horizon$calibrationSlope > CALIBRATION_SLOPE_MAX
    ) {
      stop(
        sprintf("Horizon %s calibration slope %s outside 0.80-1.20.", name, horizon$calibrationSlope),
        call. = FALSE
      )
    }
    for (subgroup in horizon$subgroups) {
      if (!is.null(subgroup$deaths) && subgroup$deaths >= SUBGROUP_DEATHS_MIN) {
        if (!is.finite(subgroup$error) || abs(subgroup$error) > SUBGROUP_ERROR_MAX) {
          stop(
            sprintf(
              "Horizon %s subgroup %s:%s error %s exceeds 0.03.",
              name,
              subgroup$variable,
              subgroup$level,
              subgroup$error
            ),
            call. = FALSE
          )
        }
      }
    }
  }
  invisible(validation)
}
