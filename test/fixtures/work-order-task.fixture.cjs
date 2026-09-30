module.exports = function workOrderTaskFixture(parentId, overrides = {}) {
  return {
    parentId,
    description: 'Fixture task',
    position: 0,
    ...overrides,
  };
};
