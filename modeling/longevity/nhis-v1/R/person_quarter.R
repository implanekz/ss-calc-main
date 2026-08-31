quarter_index <- function(year, quarter) {
  year <- as.integer(year)
  quarter <- as.integer(quarter)
  if (
    length(year) != length(quarter) ||
    anyNA(year) ||
    anyNA(quarter) ||
    any(quarter < 1L | quarter > 4L)
  ) {
    stop("Year and quarter must be aligned, with quarter between 1 and 4.", call. = FALSE)
  }
  year * 4L + quarter - 1L
}

expand_person_quarters <- function(row) {
  if (is.data.frame(row)) {
    if (nrow(row) != 1L) {
      stop("expand_person_quarters expects exactly one respondent.", call. = FALSE)
    }
    row <- as.list(row[1, , drop = FALSE])
  }

  required <- c(
    "person_id", "survey_year", "interview_quarter", "age_at_interview",
    "mortality_status", "death_year", "death_quarter"
  )
  missing <- setdiff(required, names(row))
  if (length(missing) > 0L) {
    stop(sprintf("Respondent is missing: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }

  mortality_status <- as.integer(row$mortality_status)
  if (length(mortality_status) != 1L || is.na(mortality_status) || !mortality_status %in% c(0L, 1L)) {
    stop("mortality_status must be 0 or 1.", call. = FALSE)
  }

  entry <- quarter_index(row$survey_year, row$interview_quarter)
  if (mortality_status == 1L) {
    exit <- quarter_index(row$death_year, row$death_quarter)
    if (exit < entry) {
      stop("Recorded death quarter precedes interview quarter.", call. = FALSE)
    }
  } else {
    exit <- quarter_index(2019L, 4L)
    if (exit < entry) {
      stop("Interview quarter is after the 2019 Q4 follow-up end.", call. = FALSE)
    }
  }

  observed_quarters <- seq.int(entry, exit)
  quarters_since_interview <- observed_quarters - entry
  data.frame(
    person_id = rep(as.character(row$person_id), length(observed_quarters)),
    survey_year = rep(as.integer(row$survey_year), length(observed_quarters)),
    interview_quarter = rep(as.integer(row$interview_quarter), length(observed_quarters)),
    age_at_interview = rep(as.integer(row$age_at_interview), length(observed_quarters)),
    quarter_index = as.integer(observed_quarters),
    quarters_since_interview = as.integer(quarters_since_interview),
    attained_age = as.integer(row$age_at_interview) + floor(quarters_since_interview / 4),
    event = as.integer(observed_quarters == exit & mortality_status == 1L),
    stringsAsFactors = FALSE
  )
}

expand_person_quarter_dataset <- function(rows) {
  if (!is.data.frame(rows)) {
    stop("rows must be a data frame.", call. = FALSE)
  }
  core <- c(
    "person_id", "survey_year", "interview_quarter", "age_at_interview",
    "mortality_status", "death_year", "death_quarter"
  )
  missing <- setdiff(core, names(rows))
  if (length(missing) > 0L) {
    stop(sprintf("Input is missing: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }
  n <- nrow(rows)
  if (n == 0L) {
    return(rows[0, , drop = FALSE])
  }

  status <- as.integer(rows$mortality_status)
  if (anyNA(status) || any(!status %in% c(0L, 1L))) {
    stop("mortality_status must be 0 or 1.", call. = FALSE)
  }
  entry <- quarter_index(rows$survey_year, rows$interview_quarter)
  deceased <- status == 1L
  exit <- rep.int(quarter_index(2019L, 4L), n)
  if (any(deceased)) {
    exit[deceased] <- quarter_index(rows$death_year[deceased], rows$death_quarter[deceased])
  }
  before <- exit < entry
  if (any(before & deceased)) {
    stop("Recorded death quarter precedes interview quarter.", call. = FALSE)
  }
  if (any(before & !deceased)) {
    stop("Interview quarter is after the 2019 Q4 follow-up end.", call. = FALSE)
  }

  lengths <- as.integer(exit - entry + 1L)
  idx <- rep.int(seq_len(n), lengths)
  offset <- sequence(lengths) - 1L
  expanded <- rows[idx, , drop = FALSE]
  expanded$quarter_index <- as.integer(entry[idx] + offset)
  expanded$quarters_since_interview <- as.integer(offset)
  expanded$attained_age <- as.integer(expanded$age_at_interview) + as.integer(floor(offset / 4))
  expanded$event <- as.integer(expanded$quarter_index == exit[idx] & deceased[idx])
  rownames(expanded) <- NULL
  expanded
}
