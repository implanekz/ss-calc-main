library(testthat)

source(test_path("..", "..", "R", "calibrate_ssa.R"))
source(test_path("..", "..", "R", "fit_model.R"))
source(test_path("..", "..", "R", "validate_model.R"))

test_that("solved lambda reproduces SSA qx on the probability scale", {
  rr <- c(0.7, 1.0, 1.8)
  weights <- c(0.3, 0.5, 0.2)
  ssa_qx <- 0.02
  lambda <- solve_lambda(ssa_qx, rr, weights)
  calibrated <- 1 - exp(-lambda * rr)
  expect_lt(abs(weighted.mean(calibrated, weights) - ssa_qx), 1e-10)
})

test_that("locked formula estimates smoking, education, and health together without interactions", {
  formula <- locked_model_formula()
  labels <- attr(terms(formula), "term.labels")
  expect_true(all(c("smoking", "education", "self_rated_health") %in% labels))
  expect_false(any(grepl(":", labels, fixed = TRUE)))
  expect_false(any(grepl("smoking *", deparse(formula), fixed = TRUE)))
})

test_that("relative hazards multiply the three main-effect coefficients", {
  coefficients <- list(
    smoking = list(former = 0.2, current = 0.5),
    education = list(some = 0.1, high_school = 0.3),
    health = list(good = 0.15, fair = 0.4)
  )
  expected <- exp(0.5 + 0.3 + 0.4)
  expect_equal(
    score_relative_hazard("current", "high_school", "fair", coefficients),
    expected
  )
  expect_equal(score_relative_hazard("never", "college", "excellent", coefficients), 1)
})

test_that("synthetic relative hazards calibrate every SSA age and sex to 1e-10", {
  skip_if_not_installed("jsonlite")
  ssa_path <- test_path(
    "..", "..", "..", "..", "..",
    "frontend", "src", "data", "mortality", "ssa-period-life-table-2023.json"
  )
  skip_if_not(file.exists(ssa_path))
  ssa <- jsonlite::fromJSON(ssa_path, simplifyVector = TRUE)

  coefficients <- list(
    smoking = list(former = log(1.1), current = log(1.8)),
    education = list(some = log(1.15), high_school = log(1.3)),
    health = list(good = log(1.2), fair = log(1.6))
  )
  profiles <- data.frame(
    smoking = c("never", "former", "current"),
    education = c("college", "some", "high_school"),
    health = c("excellent", "good", "fair"),
    weight = c(0.5, 0.3, 0.2),
    stringsAsFactors = FALSE
  )
  distributions <- list(
    male = list("60-69" = profiles, "70-79" = profiles, "80+" = profiles),
    female = list("60-69" = profiles, "70-79" = profiles, "80+" = profiles)
  )

  lambdas <- solve_all_lambdas(ssa, distributions, coefficients)
  for (sex in c("male", "female")) {
    for (age in 60:119) {
      band <- calibration_age_band(age)
      rel <- profile_relative_hazards(distributions[[sex]][[band]], coefficients)
      calibrated <- 1 - exp(-lambdas[[sex]][[as.character(age)]] * rel)
      ssa_qx <- ssa$data[[sex]]$qx[ssa$data[[sex]]$age == age]
      expect_lt(
        abs(weighted.mean(calibrated, distributions[[sex]][[band]]$weight) - ssa_qx),
        1e-10,
        label = paste(sex, age)
      )
    }
  }
})

test_that("PSU aggregation preserves fractional event rates", {
  source(test_path("..", "..", "R", "person_quarter.R"))
  rows <- data.frame(
    person_id = c("a", "b"),
    survey_year = 2009L,
    interview_quarter = 1L,
    age_at_interview = 70L,
    mortality_status = c(1L, 0L),
    death_year = c(2009L, NA_integer_),
    death_quarter = c(1L, NA_integer_),
    sex = "female",
    smoking = "never",
    education = "college",
    self_rated_health = "excellent",
    pooled_weight = c(100, 300),
    stratum = "10",
    psu = "1",
    stringsAsFactors = FALSE
  )
  person_quarters <- expand_person_quarter_dataset(rows)
  person_quarters <- person_quarters[, model_fit_columns(), drop = FALSE]
  person_quarters <- prepare_model_frame(person_quarters)
  cells <- aggregate_person_quarter_cells(person_quarters)
  interview_cell <- cells[cells$attained_age == 70L & cells$survey_year == 2009L, ]
  expect_true(any(interview_cell$event > 0 & interview_cell$event < 1))
})

test_that("validation gates reject overall error, subgroup error, and slope failures", {
  passing_horizon <- function(quarters) {
    list(
      observedQuarters = quarters,
      error = 0.01,
      calibrationSlope = 1.05,
      subgroups = list(
        list(variable = "sex", level = "male", deaths = 150, error = 0.02, gated = TRUE)
      )
    )
  }
  passing <- list(
    horizons = list("4" = passing_horizon(4), "12" = passing_horizon(12), "20" = passing_horizon(20))
  )
  expect_silent(assert_validation_gates(passing))

  overall_fail <- passing
  overall_fail$horizons[["4"]]$error <- 0.021
  expect_error(assert_validation_gates(overall_fail), "overall")

  subgroup_fail <- passing
  subgroup_fail$horizons[["12"]]$subgroups[[1]]$error <- 0.031
  expect_error(assert_validation_gates(subgroup_fail), "subgroup")

  slope_fail <- passing
  slope_fail$horizons[["20"]]$calibrationSlope <- 1.21
  expect_error(assert_validation_gates(slope_fail), "slope")

  ungated <- passing
  ungated$horizons[["4"]]$subgroups[[1]]$deaths <- 99
  ungated$horizons[["4"]]$subgroups[[1]]$error <- 0.05
  ungated$horizons[["4"]]$subgroups[[1]]$gated <- FALSE
  expect_silent(assert_validation_gates(ungated))
})
