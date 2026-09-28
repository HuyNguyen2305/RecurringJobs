import { MAX_MONEY_AMOUNT, MAX_STRING_LENGTH, NON_BLANK_PATTERN } from '#constants/validation.js';

const MAX_LINE_ITEMS = 100;

export const MAX_NOTES_LENGTH = 2000;

// Request body shape shared by estimates and invoices.
export const lineItemsRequestSchema = {
  type: 'array',
  minItems: 1,
  maxItems: MAX_LINE_ITEMS,
  items: {
    type: 'object',
    required: ['description', 'quantity', 'unitPrice'],
    additionalProperties: false,
    properties: {
      description: {
        type: 'string',
        minLength: 1,
        maxLength: MAX_STRING_LENGTH,
        pattern: NON_BLANK_PATTERN,
      },
      quantity: { type: 'number', exclusiveMinimum: 0, maximum: MAX_MONEY_AMOUNT },
      unitPrice: { type: 'number', minimum: 0, maximum: MAX_MONEY_AMOUNT },
    },
  },
};

// Response shape: money values are strings with 2 decimals, e.g. "12.50".
export const lineItemsResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      description: { type: 'string' },
      quantity: { type: 'string' },
      unitPrice: { type: 'string' },
      position: { type: 'integer' },
      lineTotal: { type: 'string' },
    },
  },
};
