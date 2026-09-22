module.exports = function serviceTypeFixture(overrides = {}) {
  return {
    name: 'Fixture Service',
    description: 'A service type used in tests',
    ...overrides,
  };
};
