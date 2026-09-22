module.exports = function recurrenceRuleFixture(overrides = {}) {
  return {
    frequency: 'weekly',
    interval: 1,
    weeklyPeriod: 'every',
    weeklyDaysOfWeek: [1],
    endsType: 'never',
    ...overrides,
  };
};
