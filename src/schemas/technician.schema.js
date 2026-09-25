import { MAX_STRING_LENGTH, NON_BLANK_PATTERN } from '#constants/validation.js';

const technicianResponse = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    email: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const createTechnicianSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: MAX_STRING_LENGTH,
        pattern: NON_BLANK_PATTERN,
      },
      email: { type: 'string', format: 'email', maxLength: MAX_STRING_LENGTH },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: technicianResponse,
      },
    },
  },
};

export const getTechnicianSchema = {
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
        data: technicianResponse,
      },
    },
  },
};
