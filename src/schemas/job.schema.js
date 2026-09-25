import { MAX_LENGTH_MINUTES, MAX_RECURRENCE_INTERVAL } from '#constants/validation.js';

const JOB_STATUSES = ['unconfirmed', 'confirmed', 'in_progress', 'completed', 'canceled'];
const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];
const WEEKLY_PERIODS = ['first_third', 'second_fourth', 'every'];
const MONTHLY_REPEAT_BY = ['day_of_week', 'day_of_month'];
const YEARLY_REPEAT_BY = ['day_of_week', 'day_of_year'];
const RECURRENCE_ENDS_TYPES = ['never', 'after', 'on_date'];
const EXCEPT_TYPES = ['off', 'month', 'condition', 'frequency'];
const EXCEPT_CONDITION_PERIODS = ['1st', '2nd', '3rd', '4th', '5th', 'last'];
const EXCEPT_CONDITION_EVERY = ['week', 'month'];

const timePattern = '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$';

const recurrenceSchema = {
  type: 'object',
  required: ['frequency'],
  additionalProperties: false,
  properties: {
    frequency: { type: 'string', enum: RECURRENCE_FREQUENCIES },
    interval: { type: 'integer', minimum: 1, maximum: MAX_RECURRENCE_INTERVAL },
    weeklyPeriod: { type: 'string', enum: WEEKLY_PERIODS },
    weeklyDaysOfWeek: {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 6 },
    },
    monthlyRepeatBy: { type: 'string', enum: MONTHLY_REPEAT_BY },
    yearlyRepeatBy: { type: 'string', enum: YEARLY_REPEAT_BY },
    endsType: { type: 'string', enum: RECURRENCE_ENDS_TYPES },
    endsAfterCount: {
      type: 'integer',
      minimum: 1,
      description:
        'Number of scheduled dates, counted before except rules are applied: an excepted date still uses up a slot (RFC 5545).',
    },
    endsOnDate: { type: 'string', format: 'date' },
    exceptType: { type: 'string', enum: EXCEPT_TYPES },
    exceptMonths: {
      type: 'array',
      items: { type: 'integer', minimum: 1, maximum: 12 },
    },
    exceptConditionPeriod: { type: 'string', enum: EXCEPT_CONDITION_PERIODS },
    exceptConditionDayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
    exceptConditionEvery: { type: 'string', enum: EXCEPT_CONDITION_EVERY },
    exceptJobId: { type: 'string', format: 'uuid' },
  },
};

export const createJobSchema = {
  body: {
    type: 'object',
    required: ['customerId', 'locationId', 'serviceTypeId', 'date', 'startTime', 'lengthMinutes'],
    additionalProperties: false,
    properties: {
      customerId: { type: 'string', format: 'uuid' },
      locationId: { type: 'string', format: 'uuid' },
      serviceTypeId: { type: 'string', format: 'uuid' },
      date: { type: 'string', format: 'date' },
      startTime: { type: 'string', pattern: timePattern },
      lengthMinutes: { type: 'integer', minimum: 1, maximum: MAX_LENGTH_MINUTES },
      timeWindowStart: { type: 'string', pattern: timePattern },
      timeWindowEnd: { type: 'string', pattern: timePattern },
      soldByTechnicianId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: JOB_STATUSES },
      isLocked: { type: 'boolean' },
      notifyTechnician: { type: 'boolean' },
      notifyCustomer: { type: 'boolean' },
      notificationTemplateId: { type: 'string', format: 'uuid' },
      assignees: {
        type: 'array',
        items: {
          type: 'object',
          required: ['technicianId'],
          additionalProperties: false,
          properties: {
            technicianId: { type: 'string', format: 'uuid' },
            isPrimary: { type: 'boolean' },
          },
        },
      },
      recurrence: recurrenceSchema,
    },
  },
};

export const getJobSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

export const getJobOccurrencesSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      from: { type: 'string', format: 'date' },
      to: { type: 'string', format: 'date' },
      limit: { type: 'integer', minimum: 1, maximum: 1000 },
    },
  },
};

export const listJobsSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
};
