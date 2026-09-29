import { createJobSchema } from '#schemas/job.schema.js';
import { lineItemsRequestSchema, MAX_NOTES_LENGTH } from '#schemas/line-item.schema.js';

const ESTIMATE_STATUS_TARGETS = ['sent', 'approved', 'declined'];

// Job fields a convert request may not set: the estimate supplies customer, location and
// service type, and a converted job always starts in the default status - converting straight
// into a canceled job would leave an approved estimate with a job that can never be invoiced.
const CONVERT_EXCLUDED_JOB_FIELDS = ['customerId', 'locationId', 'serviceTypeId', 'status'];

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
      notes: { type: ['string', 'null'], maxLength: MAX_NOTES_LENGTH },
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
    required: jobBody.required.filter((field) => !CONVERT_EXCLUDED_JOB_FIELDS.includes(field)),
    properties: Object.fromEntries(
      Object.entries(jobBody.properties).filter(
        ([field]) => !CONVERT_EXCLUDED_JOB_FIELDS.includes(field),
      ),
    ),
  },
};
