import { requestDateSchema } from '#schemas/date.schema.js';
import { MAX_STRING_LENGTH, NON_BLANK_PATTERN } from '#constants/validation.js';

const MAX_TASKS = 100;
const MAX_NOTES_LENGTH = 2000;

const WORK_ORDER_STATUS_TARGETS = ['in_progress', 'completed', 'canceled'];

const jobIdParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
};

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
};

export const createWorkOrderSchema = {
  params: jobIdParams,
  body: {
    type: 'object',
    required: ['occurrenceDate'],
    additionalProperties: false,
    properties: {
      occurrenceDate: requestDateSchema,
      notes: { type: ['string', 'null'], maxLength: MAX_NOTES_LENGTH },
      tasks: {
        type: 'array',
        maxItems: MAX_TASKS,
        items: {
          type: 'object',
          required: ['description'],
          additionalProperties: false,
          properties: {
            description: {
              type: 'string',
              minLength: 1,
              maxLength: MAX_STRING_LENGTH,
              pattern: NON_BLANK_PATTERN,
            },
          },
        },
      },
    },
  },
};

export const getWorkOrderSchema = {
  params: idParams,
};

export const listJobWorkOrdersSchema = {
  params: jobIdParams,
};

export const updateWorkOrderStatusSchema = {
  params: idParams,
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: WORK_ORDER_STATUS_TARGETS },
    },
  },
};

export const updateWorkOrderTaskSchema = {
  params: {
    type: 'object',
    required: ['id', 'taskId'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      taskId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['isDone'],
    additionalProperties: false,
    properties: {
      isDone: { type: 'boolean' },
    },
  },
};
