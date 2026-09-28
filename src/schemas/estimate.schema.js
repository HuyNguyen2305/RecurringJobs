import { createJobSchema } from '#schemas/job.schema.js';
import { lineItemsRequestSchema, MAX_NOTES_LENGTH } from '#schemas/line-item.schema.js';

const ESTIMATE_STATUS_TARGETS = ['sent', 'approved', 'declined'];

// The estimate supplies these to the job it converts into.
const ESTIMATE_OWNED_JOB_FIELDS = ['customerId', 'locationId', 'serviceTypeId'];

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
};

export const createEstimateSchema = {
  body: {
    type: 'object',
    required: ['customerId', 'locationId', 'serviceTypeId', 'lineItems'],
    additionalProperties: false,
    properties: {
      customerId: { type: 'string', format: 'uuid' },
      locationId: { type: 'string', format: 'uuid' },
      serviceTypeId: { type: 'string', format: 'uuid' },
      notes: { type: 'string', maxLength: MAX_NOTES_LENGTH },
      lineItems: lineItemsRequestSchema,
    },
  },
};

export const getEstimateSchema = {
  params: idParams,
};

export const updateEstimateStatusSchema = {
  params: idParams,
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ESTIMATE_STATUS_TARGETS },
    },
  },
};

const jobBody = createJobSchema.body;

export const convertEstimateSchema = {
  params: idParams,
  body: {
    ...jobBody,
    required: jobBody.required.filter((field) => !ESTIMATE_OWNED_JOB_FIELDS.includes(field)),
    properties: Object.fromEntries(
      Object.entries(jobBody.properties).filter(
        ([field]) => !ESTIMATE_OWNED_JOB_FIELDS.includes(field),
      ),
    ),
  },
};
