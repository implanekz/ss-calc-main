empty_person_years <- function() {
  data.frame(
    person_id = character(),
    attained_age = integer(),
    event = integer(),
    exposure = numeric(),
    stringsAsFactors = FALSE
  )
}

expand_person_years <- function(row) {
  if (is.data.frame(row)) {
    if (nrow(row) != 1L) {
      stop("expand_person_years expects exactly one respondent.", call. = FALSE)
    }
    row <- as.list(row[1, , drop = FALSE])
  }

  required <- c("person_id", "age_at_interview", "followup_days", "mortality_status")
  missing <- setdiff(required, names(row))
  if (length(missing) > 0L) {
    stop(sprintf("Respondent is missing: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }

  interview_age <- as.numeric(row$age_at_interview)
  followup_days <- as.numeric(row$followup_days)
  mortality_status <- as.integer(row$mortality_status)
  if (
    length(interview_age) != 1L || !is.finite(interview_age) ||
    length(followup_days) != 1L || !is.finite(followup_days) || followup_days < 0 ||
    length(mortality_status) != 1L || is.na(mortality_status) || !mortality_status %in% c(0L, 1L)
  ) {
    stop("Age, follow-up, and mortality status must be valid scalar values.", call. = FALSE)
  }

  observed_exit_age <- interview_age + followup_days / 365.2425
  entry_age <- max(60, interview_age)
  tolerance <- 1e-12
  if (observed_exit_age <= entry_age + tolerance) {
    return(empty_person_years())
  }

  first_age <- floor(entry_age)
  last_age <- ceiling(observed_exit_age - tolerance) - 1L
  attained_ages <- seq.int(first_age, last_age)
  exposure <- pmax(
    0,
    pmin(observed_exit_age, attained_ages + 1) - pmax(entry_age, attained_ages)
  )

  result <- data.frame(
    person_id = rep(as.character(row$person_id), length(attained_ages)),
    attained_age = as.integer(attained_ages),
    event = integer(length(attained_ages)),
    exposure = as.numeric(exposure),
    stringsAsFactors = FALSE
  )
  if (mortality_status == 1L) {
    result$event[[nrow(result)]] <- 1L
  }
  result
}

expand_person_year_dataset <- function(rows) {
  if (!is.data.frame(rows)) {
    stop("rows must be a data frame.", call. = FALSE)
  }
  core <- c("person_id", "age_at_interview", "followup_days", "mortality_status")
  missing <- setdiff(core, names(rows))
  if (length(missing) > 0L) {
    stop(sprintf("Input is missing: %s", paste(missing, collapse = ", ")), call. = FALSE)
  }

  metadata_names <- setdiff(names(rows), core)
  expanded <- lapply(seq_len(nrow(rows)), function(index) {
    person_years <- expand_person_years(rows[index, , drop = FALSE])
    if (nrow(person_years) == 0L) {
      return(NULL)
    }
    for (name in metadata_names) {
      person_years[[name]] <- rep(rows[[name]][[index]], nrow(person_years))
    }
    person_years
  })
  expanded <- Filter(Negate(is.null), expanded)

  if (length(expanded) == 0L) {
    output <- empty_person_years()
    for (name in metadata_names) {
      output[[name]] <- rows[[name]][FALSE]
    }
    return(output)
  }
  do.call(rbind, expanded)
}
