library(testthat)

source(test_path("..", "..", "R", "load_inputs.R"))
source(test_path("..", "..", "R", "harmonize.R"))

synthetic_mapping <- function() {
  list(
    fields = list(
      sex = list(
        source = "raw_sex",
        codes = list(male = "1", female = "2"),
        missing_codes = c("7", "8", "9")
      ),
      smoking = list(
        source = "raw_smoking",
        codes = list(never = "4", former = "3", current = c("1", "2")),
        missing_codes = c("7", "8", "9")
      ),
      education = list(
        source = "raw_education",
        codes = list(college = "C", some = "S", high_school = "H"),
        missing_codes = "M"
      ),
      self_rated_health = list(
        source = "raw_health",
        codes = list(excellent = "E", good = "G", fair = "F"),
        missing_codes = "M"
      )
    )
  )
}

synthetic_nhis_rows <- function() {
  data.frame(
    raw_sex = c("1", "2", "9", "1"),
    raw_smoking = c("4", "3", "1", "2"),
    raw_education = c("C", "S", "H", "M"),
    raw_health = c("E", "G", "F", "M"),
    stringsAsFactors = FALSE
  )
}

test_that("configured source codes map to runtime categories or explicit missing", {
  harmonized <- harmonize_health(synthetic_nhis_rows(), synthetic_mapping())

  expect_setequal(na.omit(harmonized$smoking), c("never", "former", "current"))
  expect_setequal(na.omit(harmonized$education), c("college", "some", "high_school"))
  expect_setequal(na.omit(harmonized$self_rated_health), c("excellent", "good", "fair"))
  expect_setequal(na.omit(harmonized$sex), c("male", "female"))
})

test_that("unmapped observed source codes are rejected", {
  rows <- synthetic_nhis_rows()
  rows$raw_smoking[1] <- "UNDOCUMENTED"

  expect_error(
    harmonize_health(rows, synthetic_mapping()),
    "unmapped source code.*smoking"
  )
})

test_that("pooled weights divide annual weights by cohort year count", {
  rows <- data.frame(sample_weight = c(1300, 2600), pool_year_count = c(13, 13))
  expect_equal(pool_weights(rows), c(100, 200))
})

test_that("incomplete annual mappings are rejected before input is read", {
  mapping <- list(
    status = "blocked",
    fields = list(
      person_id = list(source = c("HHX", "FMX", "FPX")),
      age_at_interview = list(source = "AGE_P"),
      sex = list(source = "SEX"),
      smoking = list(source = "SMKSTAT2"),
      education = list(source = NULL),
      self_rated_health = list(source = NULL),
      sample_weight = list(source = "WTFA_SA"),
      stratum = list(source = "PSTRAT"),
      psu = list(source = "PPSU")
    )
  )

  expect_error(validate_year_mapping(mapping, 2018), "missing required mappings.*education")
})

test_that("official SAS layouts parse multiple fields per line and legacy punctuation", {
  sas_path <- tempfile(fileext = ".sas")
  bytes <- c(
    charToRaw("/* legacy punctuation: "),
    as.raw(0x92),
    charToRaw(" */\nINPUT\n  SRVY_YR 3 - 6  HHX $ 7 - 12  FMX $ 13 - 14\n;\n")
  )
  writeBin(bytes, sas_path)

  expect_no_warning(layout <- parse_sas_fixed_width_layout(sas_path))
  expect_equal(layout$source, c("SRVY_YR", "HHX", "FMX"))
  expect_equal(layout$start, c(3L, 7L, 13L))
  expect_equal(layout$end, c(6L, 12L, 14L))
})
