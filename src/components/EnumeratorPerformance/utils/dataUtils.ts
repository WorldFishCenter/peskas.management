import { EnumeratorData, EnumeratorDailyStat } from '../types';
import { splitAlertCodes } from '../../../utils/alertCodes';

/** Sum the counts of a set of rollup rows. */
export const sumCounts = (stats: EnumeratorDailyStat[]): number =>
  stats.reduce((total, stat) => total + stat.count, 0);

/** Sum the counts of the rollup rows that carry an alert code. */
export const sumAlertCounts = (stats: EnumeratorDailyStat[]): number =>
  stats.reduce((total, stat) => (stat.alert_flag ? total + stat.count : total), 0);

/**
 * Collapse rollup rows to a sorted date → count series.
 *
 * Several rows can share a day — one per alert code — so they are summed rather than listed.
 * Rows whose date could not be parsed carry no day and are dropped from the trend, exactly as
 * they were when the endpoint returned raw submissions.
 */
export const toTrend = (stats: EnumeratorDailyStat[]): { date: string; count: number }[] => {
  const byDate: Record<string, number> = {};
  for (const stat of stats) {
    if (!stat.date) continue;
    byDate[stat.date] = (byDate[stat.date] || 0) + stat.count;
  }
  return Object.entries(byDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Group the `/enumerators-stats` rollup by enumerator.
 *
 * The endpoint already excludes placeholder enumerators and folds the three spellings of "no
 * alert" into an absent field, so there is nothing left to clean here — this is a group-by and
 * three sums.
 */
export const processEnumeratorData = (rollup: EnumeratorDailyStat[]): EnumeratorData[] => {
  if (!rollup || rollup.length === 0) return [];

  const byEnumerator: Record<string, EnumeratorDailyStat[]> = {};
  for (const stat of rollup) {
    if (!stat.submitted_by) continue;
    (byEnumerator[stat.submitted_by] ||= []).push(stat);
  }

  return Object.entries(byEnumerator)
    .map(([name, dailyStats]): EnumeratorData => {
      const totalSubmissions = sumCounts(dailyStats);
      const submissionsWithAlerts = sumAlertCounts(dailyStats);
      return {
        name,
        dailyStats,
        totalSubmissions,
        submissionsWithAlerts,
        errorRate: totalSubmissions > 0 ? (submissionsWithAlerts / totalSubmissions) * 100 : 0,
        submissionTrend: toTrend(dailyStats)
      };
    })
    .sort((a, b) => b.totalSubmissions - a.totalSubmissions);
};

/**
 * Quality score for an enumerator: 100 minus their error rate.
 *
 * Prefers `filteredErrorRate`, which is set whenever a date filter is active, and falls back
 * to the all-time rate otherwise. Every quality figure in the UI comes from here so the
 * filtered/unfiltered fallback cannot be applied inconsistently.
 */
export const qualityScore = (
  enumerator: Pick<EnumeratorData, 'errorRate' | 'filteredErrorRate'> | undefined
): number => 100 - (enumerator?.filteredErrorRate ?? enumerator?.errorRate ?? 0);

/**
 * Tally alert codes across one or more enumerators, most frequent first.
 *
 * A rollup row counts submissions sharing one alert list ("3, 7"), so each code in the list
 * gains that many: a submission with two codes adds one to each. Every other figure on the page
 * counts the submission once.
 *
 * Shared by the aggregate alert chart and the single-enumerator one — the former passes the
 * whole list, the latter an array of one.
 */
export const tallyAlertFlags = (
  enumerators: EnumeratorData[]
): { name: string; y: number }[] => {
  const counts: Record<string, number> = {};

  enumerators.forEach(enumerator => {
    (enumerator.filteredStats || enumerator.dailyStats).forEach(stat => {
      if (!stat.alert_flag) return;
      for (const code of splitAlertCodes(stat.alert_flag)) {
        counts[code] = (counts[code] || 0) + stat.count;
      }
    });
  });

  return Object.entries(counts)
    .map(([name, y]) => ({ name, y }))
    .sort((a, b) => b.y - a.y);
};

/**
 * Find the best performing enumerator based on quality (lowest error rate)
 * Only considers enumerators with a minimum number of submissions for statistical significance
 *
 * @param enumerators - Array of enumerator data
 * @param minSubmissions - Minimum submissions required (default: 10)
 * @returns The best performing enumerator
 */
export const findBestEnumerator = (
  enumerators: EnumeratorData[],
  minSubmissions: number = 10
): EnumeratorData => {
  if (enumerators.length === 0) {
    return {
      name: '',
      errorRate: 0,
      filteredErrorRate: 0,
      dailyStats: [],
      totalSubmissions: 0,
      submissionsWithAlerts: 0,
      submissionTrend: []
    };
  }

  // Filter to enumerators with sufficient submissions for meaningful comparison
  const qualified = enumerators.filter(e => {
    const submissions = e.filteredTotal !== undefined ? e.filteredTotal : e.totalSubmissions;
    return submissions >= minSubmissions;
  });

  // If no one meets the minimum, lower the threshold and try again
  if (qualified.length === 0) {
    const lowerThreshold = Math.max(1, Math.floor(minSubmissions / 2));
    const secondAttempt = enumerators.filter(e => {
      const submissions = e.filteredTotal !== undefined ? e.filteredTotal : e.totalSubmissions;
      return submissions >= lowerThreshold;
    });

    // If still no one qualifies, return the one with most submissions
    if (secondAttempt.length === 0) {
      return enumerators.reduce((best, current) => {
        const bestSubs = best.filteredTotal ?? best.totalSubmissions;
        const currentSubs = current.filteredTotal ?? current.totalSubmissions;
        return currentSubs > bestSubs ? current : best;
      }, enumerators[0]);
    }

    // Use the lower threshold candidates
    return secondAttempt.reduce((best, current) => {
      const bestError = best.filteredErrorRate !== undefined ? best.filteredErrorRate : best.errorRate;
      const currentError = current.filteredErrorRate !== undefined ? current.filteredErrorRate : current.errorRate;

      // Prioritize quality (lowest error rate)
      if (currentError < bestError) return current;
      if (currentError > bestError) return best;

      // If equal quality, prefer higher volume
      const bestSubs = best.filteredTotal ?? best.totalSubmissions;
      const currentSubs = current.filteredTotal ?? current.totalSubmissions;
      return currentSubs > bestSubs ? current : best;
    }, secondAttempt[0]);
  }

  // Find the enumerator with the lowest error rate among qualified candidates
  return qualified.reduce((best, current) => {
    const bestError = best.filteredErrorRate !== undefined ? best.filteredErrorRate : best.errorRate;
    const currentError = current.filteredErrorRate !== undefined ? current.filteredErrorRate : current.errorRate;

    // Prioritize quality (lowest error rate wins)
    if (currentError < bestError) return current;
    if (currentError > bestError) return best;

    // If error rates are equal, prefer higher volume as tiebreaker
    const bestSubs = best.filteredTotal ?? best.totalSubmissions;
    const currentSubs = current.filteredTotal ?? current.totalSubmissions;
    return currentSubs > bestSubs ? current : best;
  }, qualified[0]);
}; 