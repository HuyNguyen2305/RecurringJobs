// An invoice row for customer_documents (the repository sets `type`).
module.exports = function invoiceFixture(
  { customerId, locationId, serviceTypeId, jobId, occurrenceDate },
  overrides = {},
) {
  return {
    customerId,
    locationId,
    serviceTypeId,
    jobId,
    occurrenceDate,
    jobSnapshot: { note: 'fixture snapshot' },
    ...overrides,
  };
};
