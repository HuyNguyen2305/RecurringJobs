import { requestDateSchema } from '#schemas/date.schema.js';
import { OCCURRENCE_TARGET_STATUSES } from '#constants/job-status.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
};

export const getJobScheduleSchema = {
  summary: "A job's schedule as a calendar shows it",
  description:
    'Each occurrence with its status and a state: real (available), hollow (projected, waiting on ' +
    'the one before it) or overdue (its day passed unsettled; nothing after it is returned). ' +
    'Rescheduled visits appear right after the occurrence they came from. The plain list of ' +
    'recurrence dates is GET /jobs/{id}/occurrences.',
  params: idParams,
  querystring: {
    type: 'object',
    properties: {
      from: requestDateSchema,
      to: requestDateSchema,
      limit: { type: 'integer', minimum: 1, maximum: 1000 },
    },
  },
};

export const updateOccurrenceStatusSchema = {
  summary: 'Change the status of one occurrence',
  description:
    'Moves one occurrence (or a visit it was rescheduled to) forward. It must be available, ' +
    'meaning the occurrence before it is settled, and completing is only allowed on or after ' +
    'its date. Rescheduling needs rescheduledTo and creates a visit on that date.',
  params: {
    type: 'object',
    required: ['id', 'date'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      date: requestDateSchema,
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: OCCURRENCE_TARGET_STATUSES },
      rescheduledTo: requestDateSchema,
    },
  },
};
