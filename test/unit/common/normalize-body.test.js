import { normalizeBody, nullifyBlankOptionals } from '#common/normalize-body.js';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    phone: { type: ['string', 'null'] },
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          note: { type: ['string', 'null'] },
        },
      },
    },
  },
};

describe('normalizeBody', () => {
  it('trims strings, then turns blank optional text into null', () => {
    expect(
      normalizeBody(
        { name: '  Alice  ', phone: '   ', lineItems: [{ description: ' Mow ', note: ' ' }] },
        schema,
      ),
    ).toEqual({ name: 'Alice', phone: null, lineItems: [{ description: 'Mow', note: null }] });
  });

  it('keeps a blank non-nullable field blank, so validation rejects it with its usual message', () => {
    expect(normalizeBody({ name: '   ', lineItems: [{ description: '' }] }, schema)).toEqual({
      name: '',
      lineItems: [{ description: '' }],
    });
  });

  it('only trims when the route has no body schema', () => {
    expect(normalizeBody({ phone: '  ' }, undefined)).toEqual({ phone: '' });
  });

  it('leaves unknown properties and non-strings untouched', () => {
    expect(normalizeBody({ extra: '', phone: null, name: 1 }, schema)).toEqual({
      extra: '',
      phone: null,
      name: 1,
    });
  });

  it('does not mutate the input', () => {
    const input = { phone: '' };

    nullifyBlankOptionals(input, schema);

    expect(input).toEqual({ phone: '' });
  });
});
