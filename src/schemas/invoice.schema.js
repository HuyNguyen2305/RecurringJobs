import {
  lineItemsRequestSchema,
  lineItemsResponseSchema,
  MAX_NOTES_LENGTH,
} from '#schemas/line-item.schema.js';

const invoiceResponse = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: ['invoice'] },
    customerId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    serviceTypeId: { type: 'string', format: 'uuid' },
    jobId: { type: 'string', format: 'uuid' },
    occurrenceDate: { type: 'string', format: 'date' },
    status: { type: 'string', enum: ['draft', 'sent', 'paid'] },
    notes: { type: ['string', 'null'] },
    jobSnapshot: { type: 'object', additionalProperties: true },
    lineItems: lineItemsResponseSchema,
    total: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const createInvoiceSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['occurrenceDate', 'lineItems'],
    additionalProperties: false,
    properties: {
      occurrenceDate: { type: 'string', format: 'date' },
      notes: { type: 'string', maxLength: MAX_NOTES_LENGTH },
      lineItems: lineItemsRequestSchema,
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: invoiceResponse,
      },
    },
  },
};

export const getInvoiceSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

export const listJobInvoicesSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};
