const locationResponse = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    customerId: { type: 'string', format: 'uuid' },
    addressLine1: { type: 'string' },
    city: { type: ['string', 'null'] },
    state: { type: ['string', 'null'] },
    zip: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const createLocationSchema = {
  body: {
    type: 'object',
    required: ['customerId', 'addressLine1'],
    properties: {
      customerId: { type: 'string', format: 'uuid' },
      addressLine1: { type: 'string', minLength: 1 },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: locationResponse,
      },
    },
  },
};

export const getLocationSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: locationResponse,
      },
    },
  },
};
