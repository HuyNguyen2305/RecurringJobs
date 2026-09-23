module.exports = function invoiceFixture({ jobId, occurrenceDate }, overrides = {}) {
  return {
    jobId,
    occurrenceDate,
    amount: 100,
    jobSnapshot: { note: 'fixture snapshot' },
    ...overrides,
  };
};
