// An estimate row for customer_documents (the repository sets `type`).
module.exports = function estimateFixture(
  { customerId, locationId, serviceTypeId },
  overrides = {},
) {
  return {
    customerId,
    locationId,
    serviceTypeId,
    notes: 'fixture estimate',
    ...overrides,
  };
};
