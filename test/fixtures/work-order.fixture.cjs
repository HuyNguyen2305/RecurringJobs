module.exports = function workOrderFixture({ jobId, occurrenceDate }, overrides = {}) {
  return {
    jobId,
    occurrenceDate,
    ...overrides,
  };
};
