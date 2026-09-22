import { ValidationError } from '#common/error.js';

const MS_PER_DAY = 86400000;

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function nthWeekdayOfMonth(year, month, weekday, n) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  let offset = weekday - firstWeekday;
  if (offset < 0) offset += 7;
  const day = 1 + offset + (n - 1) * 7;
  if (day > daysInMonth(year, month)) return null;
  return new Date(Date.UTC(year, month, day));
}

function ordinalOfWeekdayInMonth(date) {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

function isLastWeekdayOccurrence(date) {
  return date.getUTCDate() + 7 > daysInMonth(date.getUTCFullYear(), date.getUTCMonth());
}

const CONDITION_PERIOD_TO_N = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };

function isExcepted(rule, date, excludeDates) {
  switch (rule.exceptType) {
    case 'month':
      return rule.exceptMonths.includes(date.getUTCMonth() + 1);
    case 'condition': {
      if (date.getUTCDay() !== rule.exceptConditionDayOfWeek) return false;
      if (rule.exceptConditionEvery === 'week') return true;
      if (rule.exceptConditionPeriod === 'last') return isLastWeekdayOccurrence(date);
      return ordinalOfWeekdayInMonth(date) === CONDITION_PERIOD_TO_N[rule.exceptConditionPeriod];
    }
    case 'frequency':
      return excludeDates ? excludeDates.has(formatDate(date)) : false;
    default:
      return false;
  }
}

function* iterateDaily(anchor, interval) {
  let d = anchor;
  while (true) {
    yield d;
    d = addDays(d, interval);
  }
}

function* iterateWeeklyEvery(anchor, interval, daysOfWeek) {
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
  let weekStart = addDays(anchor, -anchor.getUTCDay());
  while (true) {
    for (const weekday of sortedDays) {
      const d = addDays(weekStart, weekday);
      if (d >= anchor) yield d;
    }
    weekStart = addDays(weekStart, 7 * interval);
  }
}

function* iterateWeeklyParity(anchor, parity, daysOfWeek) {
  const wanted = parity === 'first_third' ? [1, 3] : [2, 4];
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
  let year = anchor.getUTCFullYear();
  let month = anchor.getUTCMonth();
  while (true) {
    const monthDates = [];
    for (const weekday of sortedDays) {
      for (const n of wanted) {
        const d = nthWeekdayOfMonth(year, month, weekday, n);
        if (d) monthDates.push(d);
      }
    }
    monthDates.sort((a, b) => a - b);
    for (const d of monthDates) {
      if (d >= anchor) yield d;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
}

function* iterateMonthlyDayOfMonth(anchor, interval) {
  const day = anchor.getUTCDate();
  let year = anchor.getUTCFullYear();
  let month = anchor.getUTCMonth();
  while (true) {
    const clampedDay = Math.min(day, daysInMonth(year, month));
    yield new Date(Date.UTC(year, month, clampedDay));
    month += interval;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
  }
}

function* iterateMonthlyDayOfWeek(anchor, interval) {
  const weekday = anchor.getUTCDay();
  const n = ordinalOfWeekdayInMonth(anchor);
  let year = anchor.getUTCFullYear();
  let month = anchor.getUTCMonth();
  while (true) {
    const d = nthWeekdayOfMonth(year, month, weekday, n);
    if (d) yield d;
    month += interval;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
  }
}

function* iterateYearlyDayOfYear(anchor, interval) {
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  let year = anchor.getUTCFullYear();
  while (true) {
    const clampedDay = Math.min(day, daysInMonth(year, month));
    yield new Date(Date.UTC(year, month, clampedDay));
    year += interval;
  }
}

function* iterateYearlyDayOfWeek(anchor, interval) {
  const month = anchor.getUTCMonth();
  const weekday = anchor.getUTCDay();
  const n = ordinalOfWeekdayInMonth(anchor);
  let year = anchor.getUTCFullYear();
  while (true) {
    const d = nthWeekdayOfMonth(year, month, weekday, n);
    if (d) yield d;
    year += interval;
  }
}

function pickIterator(rule, anchor) {
  switch (rule.frequency) {
    case 'daily':
      return iterateDaily(anchor, rule.interval);
    case 'weekly':
      return rule.weeklyPeriod === 'every'
        ? iterateWeeklyEvery(anchor, rule.interval, rule.weeklyDaysOfWeek)
        : iterateWeeklyParity(anchor, rule.weeklyPeriod, rule.weeklyDaysOfWeek);
    case 'monthly':
      return rule.monthlyRepeatBy === 'day_of_week'
        ? iterateMonthlyDayOfWeek(anchor, rule.interval)
        : iterateMonthlyDayOfMonth(anchor, rule.interval);
    case 'yearly':
      return rule.yearlyRepeatBy === 'day_of_week'
        ? iterateYearlyDayOfWeek(anchor, rule.interval)
        : iterateYearlyDayOfYear(anchor, rule.interval);
    default:
      throw new ValidationError(`Unsupported recurrence frequency: ${rule.frequency}`);
  }
}

const MAX_ITERATIONS = 100000;
const DEFAULT_SAFETY_CAP = 1000;

export function generateOccurrences(rule, anchorDateStr, { from, to, limit, excludeDates } = {}) {
  const anchor = parseDate(anchorDateStr);
  const fromDate = from ? parseDate(from) : null;
  const toDate = to ? parseDate(to) : null;
  const excludeSet = excludeDates ? new Set(excludeDates) : null;

  if (rule.endsType === 'never' && !toDate && limit == null) {
    throw new ValidationError(
      'Unbounded recurrence (endsType "never") requires a "to" date or a "limit"',
    );
  }

  const endsOnDate = rule.endsOnDate ? parseDate(rule.endsOnDate) : null;
  const safetyCap = limit ?? DEFAULT_SAFETY_CAP;

  const iterator = pickIterator(rule, anchor);
  const results = [];
  let ordinal = 0;
  let iterations = 0;

  for (const d of iterator) {
    iterations += 1;
    if (iterations > MAX_ITERATIONS) break;

    ordinal += 1;
    if (rule.endsType === 'after' && ordinal > rule.endsAfterCount) break;
    if (rule.endsType === 'on_date' && d > endsOnDate) break;
    if (toDate && d > toDate) break;

    if ((!fromDate || d >= fromDate) && !isExcepted(rule, d, excludeSet)) {
      results.push(formatDate(d));
      if (results.length >= safetyCap) break;
    }
  }

  return results;
}
