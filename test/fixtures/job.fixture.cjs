module.exports = function jobFixture({ customerId, locationId, serviceTypeId }, overrides = {}) {
  return {
    customerId,
    locationId,
    serviceTypeId,
    date: '2026-10-01',
    startTime: '12:30',
    lengthMinutes: 30,
    ...overrides,
  };
};
