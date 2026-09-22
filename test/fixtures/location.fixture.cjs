module.exports = function locationFixture(customerId, overrides = {}) {
  return {
    customerId,
    addressLine1: '1 Wall Street',
    city: 'New York',
    state: 'NY',
    zip: '10005',
    ...overrides,
  };
};
