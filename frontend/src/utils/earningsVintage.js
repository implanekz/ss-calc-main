/**
 * Two independent signals. Never collapse them.
 *
 * File vintage = today − statement_date (how old the download is).
 * Data gap     = (current year − 1) − last banked earnings year.
 *
 * Old file + gap → re-download will help.
 * Fresh file + gap → SSA has not posted yet; do not send them back.
 */

const STALE_FILE_MONTHS = 12;

const monthsBetween = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
};

export const lastBankedEarningsYear = (rows = []) => {
  const banked = rows.filter((row) => !row.isProjected && Number(row.earnings) > 0);
  if (banked.length === 0) return null;
  return Math.max(...banked.map((row) => row.year));
};

export const describeEarningsVintage = ({
  statementDate,
  rows = [],
  today = new Date()
} = {}) => {
  const currentYear = today.getFullYear();
  const lastBanked = lastBankedEarningsYear(rows);
  const dataGapYears = lastBanked == null ? null : (currentYear - 1) - lastBanked;
  const hasDataGap = dataGapYears != null && dataGapYears > 0;

  if (!statementDate) {
    return {
      kind: 'unknown',
      fileMonthsOld: null,
      lastBankedYear: lastBanked,
      dataGapYears,
      message: null
    };
  }

  const fileMonthsOld = monthsBetween(statementDate, today);
  const isStaleFile = fileMonthsOld != null && fileMonthsOld >= STALE_FILE_MONTHS;

  if (isStaleFile && hasDataGap) {
    return {
      kind: 'redownload',
      fileMonthsOld,
      lastBankedYear: lastBanked,
      dataGapYears,
      message:
        'This earnings file is more than a year old and is missing recent years. Download a fresh XML from the same SSA page you used before — a new file will include the years that posted since then.'
    };
  }

  if (!isStaleFile && hasDataGap) {
    return {
      kind: 'posting_lag',
      fileMonthsOld,
      lastBankedYear: lastBanked,
      dataGapYears,
      message:
        'This file is current, but SSA has not posted last year’s earnings yet. Re-downloading will not fill the gap. We will use the years that are already on the record.'
    };
  }

  return {
    kind: 'current',
    fileMonthsOld,
    lastBankedYear: lastBanked,
    dataGapYears: hasDataGap ? dataGapYears : 0,
    message: null
  };
};
