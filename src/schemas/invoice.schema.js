const invoiceResponse = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    jobId: { type: 'string', format: 'uuid' },
    occurrenceDate: { type: 'string', format: 'date' },
    amount: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'sent', 'paid'] },
    jobSnapshot: { type: 'object', additionalProperties: true },
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
    required: ['occurrenceDate', 'amount'],
    properties: {
      occurrenceDate: { type: 'string', format: 'date' },
      amount: { type: 'number', minimum: 0 },
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
