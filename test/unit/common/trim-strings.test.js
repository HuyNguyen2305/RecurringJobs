import { trimStrings } from '#common/trim-strings.js';

describe('trimStrings', () => {
  it('trims strings at any depth in objects and arrays', () => {
    expect(
      trimStrings({
        name: '  Alice  ',
        lineItems: [{ description: '\tMow\n', quantity: 2 }],
        tags: [' a ', 'b'],
      }),
    ).toEqual({
      name: 'Alice',
      lineItems: [{ description: 'Mow', quantity: 2 }],
      tags: ['a', 'b'],
    });
  });

  it('leaves numbers, booleans and null untouched', () => {
    expect(trimStrings({ quantity: 1.5, isPrimary: false, phone: null })).toEqual({
      quantity: 1.5,
      isPrimary: false,
      phone: null,
    });
    expect(trimStrings(null)).toBeNull();
    expect(trimStrings(undefined)).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input = { name: '  Alice  ', nested: { city: ' HCMC ' } };

    trimStrings(input);

    expect(input).toEqual({ name: '  Alice  ', nested: { city: ' HCMC ' } });
  });
});
