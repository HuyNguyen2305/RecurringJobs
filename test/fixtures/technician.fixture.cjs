module.exports = function technicianFixture(overrides = {}) {
  return {
    name: 'Fixture Technician',
    email: 'fixture.technician@example.com',
    ...overrides,
  };
};
