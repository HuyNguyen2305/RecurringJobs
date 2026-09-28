const MS_PER_DAY = 86400000;

// Today (UTC) plus `days`, as YYYY-MM-DD - the same UTC date convention as the recurrence engine.
export function addDaysUtc(days) {
  return new Date(Date.now() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function todayUtc() {
  return addDaysUtc(0);
}
