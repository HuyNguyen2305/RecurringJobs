module.exports = function customerFixture(overrides = {}) {
  return {
    name: 'Fixture Customer',
    email: 'fixture.customer@example.com',
    phone: '555-0100',
    ...overrides,
  };
};
