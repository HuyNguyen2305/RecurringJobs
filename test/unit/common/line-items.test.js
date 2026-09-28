import { validateLineItems, toLineItemRows, summarizeLineItems } from '#common/line-items.js';
import { ValidationError } from '#common/error.js';

describe('validateLineItems', () => {
  it('accepts whole and 2-decimal quantities and prices', () => {
    expect(() =>
      validateLineItems([
        { description: 'a', quantity: 1, unitPrice: 0 },
        { description: 'b', quantity: 1.5, unitPrice: 12.34 },
        { description: 'c', quantity: 0.01, unitPrice: 1.1 },
      ]),
    ).not.toThrow();
  });

  it.each([
    ['a quantity of 0', { quantity: 0, unitPrice: 1 }],
    ['a negative quantity', { quantity: -1, unitPrice: 1 }],
    ['a 3-decimal quantity', { quantity: 1.005, unitPrice: 1 }],
    ['a 3-decimal unit price', { quantity: 1, unitPrice: 9.999 }],
  ])('rejects %s', (_label, item) => {
    expect(() => validateLineItems([{ description: 'x', ...item }])).toThrow(ValidationError);
  });
});

describe('toLineItemRows', () => {
  it('attaches the parent id and positions rows in request order', () => {
    expect(
      toLineItemRows('doc-1', [
        { description: 'a', quantity: 1, unitPrice: 2 },
        { description: 'b', quantity: 3, unitPrice: 4 },
      ]),
    ).toEqual([
      { parentId: 'doc-1', description: 'a', quantity: 1, unitPrice: 2, position: 0 },
      { parentId: 'doc-1', description: 'b', quantity: 3, unitPrice: 4, position: 1 },
    ]);
  });
});

describe('summarizeLineItems', () => {
  it('formats DECIMAL strings and totals exactly in cents', () => {
    const { lineItems, total } = summarizeLineItems([
      { id: 'a', description: 'a', quantity: '3.00', unitPrice: '0.10', position: 0 },
      { id: 'b', description: 'b', quantity: '1.5', unitPrice: '0.33', position: 1 },
    ]);

    expect(lineItems).toEqual([
      {
        id: 'a',
        description: 'a',
        quantity: '3.00',
        unitPrice: '0.10',
        position: 0,
        lineTotal: '0.30',
      },
      {
        id: 'b',
        description: 'b',
        quantity: '1.50',
        unitPrice: '0.33',
        position: 1,
        lineTotal: '0.50',
      },
    ]);
    expect(total).toBe('0.80');
  });

  it('returns an empty list and 0.00 for no rows', () => {
    expect(summarizeLineItems([])).toEqual({ lineItems: [], total: '0.00' });
  });
});
