calibration_age_band <- function(age) {
  age <- as.numeric(age)
  ifelse(age >= 80, "80+", ifelse(age >= 70, "70-79", "60-69"))
}

score_relative_hazard <- function(smoking, education, health, coefficients) {
  linear_predictor <- 0
  if (!identical(as.character(smoking), "never")) {
    value <- coefficients$smoking[[as.character(smoking)]]
    if (is.null(value) || !is.finite(value)) {
      stop(sprintf("Missing smoking coefficient for %s.", smoking), call. = FALSE)
    }
    linear_predictor <- linear_predictor + value
  }
  if (!identical(as.character(education), "college")) {
    value <- coefficients$education[[as.character(education)]]
    if (is.null(value) || !is.finite(value)) {
      stop(sprintf("Missing education coefficient for %s.", education), call. = FALSE)
    }
    linear_predictor <- linear_predictor + value
  }
  if (!identical(as.character(health), "excellent")) {
    value <- coefficients$health[[as.character(health)]]
    if (is.null(value) || !is.finite(value)) {
      stop(sprintf("Missing health coefficient for %s.", health), call. = FALSE)
    }
    linear_predictor <- linear_predictor + value
  }
  exp(linear_predictor)
}

profile_relative_hazards <- function(profiles, coefficients) {
  if (is.data.frame(profiles)) {
    smoking <- as.character(profiles$smoking)
    education <- as.character(profiles$education)
    health <- as.character(profiles$health)
  } else {
    smoking <- vapply(profiles, function(row) as.character(row$smoking), character(1))
    education <- vapply(profiles, function(row) as.character(row$education), character(1))
    health <- vapply(profiles, function(row) as.character(row$health), character(1))
  }
  as.numeric(mapply(
    score_relative_hazard,
    smoking,
    education,
    health,
    MoreArgs = list(coefficients = coefficients)
  ))
}

profile_weights <- function(profiles) {
  if (is.data.frame(profiles)) {
    as.numeric(profiles$weight)
  } else {
    vapply(profiles, function(row) as.numeric(row$weight), numeric(1))
  }
}

build_calibration_distributions <- function(records) {
  required <- c(
    "smoking", "education", "self_rated_health", "sex",
    "age_at_interview", "pooled_weight"
  )
  missing <- setdiff(required, names(records))
  if (length(missing) > 0L) {
    stop(sprintf("Calibration records are missing: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }

  complete <- records[
    !is.na(records$smoking) &
      !is.na(records$education) &
      !is.na(records$self_rated_health) &
      !is.na(records$sex) &
      is.finite(as.numeric(records$age_at_interview)) &
      is.finite(as.numeric(records$pooled_weight)) &
      as.numeric(records$pooled_weight) > 0,
    ,
    drop = FALSE
  ]
  if (nrow(complete) == 0L) {
    stop("No complete 2015–2018 calibration profiles were available.", call. = FALSE)
  }

  complete$age_band <- calibration_age_band(complete$age_at_interview)
  complete$health <- as.character(complete$self_rated_health)
  sexes <- c("male", "female")
  bands <- c("60-69", "70-79", "80+")
  out <- lapply(sexes, function(sex) {
    band_list <- lapply(bands, function(band) {
      slice <- complete[complete$sex == sex & complete$age_band == band, , drop = FALSE]
      if (nrow(slice) == 0L) {
        stop(sprintf("No calibration respondents for %s %s.", sex, band), call. = FALSE)
      }
      keys <- paste(slice$smoking, slice$education, slice$health, sep = "\t")
      grouped <- tapply(as.numeric(slice$pooled_weight), keys, sum)
      weights <- as.numeric(grouped) / sum(as.numeric(grouped))
      parts <- strsplit(names(grouped), "\t", fixed = TRUE)
      data.frame(
        smoking = vapply(parts, `[[`, character(1), 1L),
        education = vapply(parts, `[[`, character(1), 2L),
        health = vapply(parts, `[[`, character(1), 3L),
        weight = weights,
        stringsAsFactors = FALSE
      )
    })
    names(band_list) <- bands
    band_list
  })
  names(out) <- sexes
  out
}

export_profile_distributions <- function(distributions) {
  lapply(distributions, function(sex_bands) {
    lapply(sex_bands, function(profiles) {
      if (!is.data.frame(profiles)) {
        return(profiles)
      }
      lapply(seq_len(nrow(profiles)), function(index) {
        list(
          smoking = profiles$smoking[[index]],
          education = profiles$education[[index]],
          health = profiles$health[[index]],
          weight = profiles$weight[[index]]
        )
      })
    })
  })
}

solve_all_lambdas <- function(ssa, distributions, coefficients) {
  sexes <- c("male", "female")
  out <- lapply(sexes, function(sex) {
    qx_table <- ssa$data[[sex]]
    ages <- as.integer(qx_table$age)
    lambdas <- lapply(ages, function(age) {
      if (is.na(age) || age < 60L || age > 119L) {
        return(NULL)
      }
      band <- calibration_age_band(age)
      profiles <- distributions[[sex]][[band]]
      if (is.null(profiles)) {
        stop(sprintf("Missing calibration distribution for %s %s.", sex, band), call. = FALSE)
      }
      rel <- profile_relative_hazards(profiles, coefficients)
      solve_lambda(qx_table$qx[qx_table$age == age], rel, profile_weights(profiles))
    })
    names(lambdas) <- as.character(ages)
    lambdas[!vapply(lambdas, is.null, logical(1))]
  })
  names(out) <- sexes
  out
}

solve_lambda <- function(ssa_qx, relative_hazard, profile_weight) {
  if (length(ssa_qx) != 1L || !is.finite(ssa_qx) || ssa_qx < 0 || ssa_qx >= 1) {
    stop("ssa_qx must be a finite value in [0, 1).", call. = FALSE)
  }
  if (length(relative_hazard) == 0L || length(relative_hazard) != length(profile_weight)) {
    stop("relative_hazard and profile_weight must be aligned and non-empty.", call. = FALSE)
  }
  if (any(!is.finite(relative_hazard)) || any(relative_hazard <= 0)) {
    stop("relative_hazard must be finite and positive.", call. = FALSE)
  }
  if (any(!is.finite(profile_weight)) || any(profile_weight < 0) || sum(profile_weight) <= 0) {
    stop("profile_weight must be finite, non-negative, and have a positive sum.", call. = FALSE)
  }
  if (ssa_qx == 0) {
    return(0)
  }

  objective <- function(lambda) {
    weighted.mean(1 - exp(-lambda * relative_hazard), profile_weight) - ssa_qx
  }
  interval <- c(0, -log(1 - min(0.999999999, ssa_qx)) * 100)
  root <- uniroot(objective, interval = interval, tol = 1e-14)$root
  calibrated <- 1 - exp(-root * relative_hazard)
  if (abs(weighted.mean(calibrated, profile_weight) - ssa_qx) > 1e-10) {
    stop("Solved lambda did not reproduce SSA qx within 1e-10.", call. = FALSE)
  }
  root
}
