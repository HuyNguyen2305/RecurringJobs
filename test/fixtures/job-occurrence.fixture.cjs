module.exports = function jobOccurrenceFixture({ jobId, occurrenceDate }, overrides = {}) {
  return {
    jobId,
    occurrenceDate,
    ...overrides,
  };
};
