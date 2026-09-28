module.exports = function customerLineItemFixture(parentId, overrides = {}) {
  return {
    parentId,
    description: 'Fixture line item',
    quantity: 1,
    unitPrice: 10,
    position: 0,
    ...overrides,
  };
};
