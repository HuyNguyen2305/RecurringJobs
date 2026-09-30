import { readdirSync } from 'node:fs';
import { URL } from 'node:url';
import { jest } from '@jest/globals';
import { MAX_STRING_LENGTH } from '#constants/validation.js';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_TYPE_ID = '33333333-3333-4333-8333-333333333333';
const TECHNICIAN_ID = '44444444-4444-4444-8444-444444444444';

const customerService = { create: jest.fn(async (data) => ({ id: CUSTOMER_ID, ...data })) };
const jobService = {
  create: jest.fn(async (data) => ({ id: 'job-1', ...data })),
  list: jest.fn(async ({ page, pageSize }) => ({
    data: [],
    pagination: { page, pageSize, total: 0 },
  })),
  getOccurrences: jest.fn(async () => []),
};
const invoiceService = { generate: jest.fn(async () => ({ id: 'invoice-1' })) };
const estimateService = {
  create: jest.fn(async (data) => ({ id: 'estimate-1', ...data })),
  convertToJob: jest.fn(async (id, data) => ({ id: 'job-1', ...data })),
};
const workOrderService = {
  create: jest.fn(async (jobId, data) => ({ id: 'work-order-1', jobId, ...data })),
  updateStatus: jest.fn(async (id, status) => ({ id, status })),
  updateTask: jest.fn(async (id) => ({ id })),
  listForJob: jest.fn(async () => []),
};

jest.unstable_mockModule('#service/customer.service.js', () => ({
  CustomerService: jest.fn(() => customerService),
}));
jest.unstable_mockModule('#service/job.service.js', () => ({
  JobService: jest.fn(() => jobService),
}));
jest.unstable_mockModule('#service/invoice.service.js', () => ({
  InvoiceService: jest.fn(() => invoiceService),
}));
jest.unstable_mockModule('#service/estimate.service.js', () => ({
  EstimateService: jest.fn(() => estimateService),
}));
jest.unstable_mockModule('#service/work-order.service.js', () => ({
  WorkOrderService: jest.fn(() => workOrderService),
}));

const { buildApp } = await import('../../src/app.js');

// @fastify/autoload imports every router in parallel, and Jest's ESM runtime can fail to link
// a module that two routers import at the same moment ("... that is not linked"). Loading the
// routers one at a time first means autoload only ever gets already-linked modules.
const routersDir = new URL('../../src/routers/', import.meta.url);
for (const file of readdirSync(routersDir).sort()) {
  await import(new URL(file, routersDir).href);
}

// The first boot in a cold process loads the whole app and can exceed Jest's 5s default
// hook timeout on a slow start, which failed the first describe's tests intermittently.
const APP_BOOT_TIMEOUT_MS = 30_000;

async function buildTestApp() {
  const app = await buildApp();
  app.log.level = 'silent';
  await app.ready();
  return app;
}

describe('buildApp error handler', () => {
  let app;

  beforeAll(async () => {
    app = await buildTestApp();
  }, APP_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false });
  });

  it('returns 415 for an unsupported content type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'content-type': 'application/xml' },
      payload: '<name>x</name>',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ success: false });
  });
});

describe('buildApp body validation', () => {
  let app;

  beforeAll(async () => {
    app = await buildTestApp();
  }, APP_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    customerService.create.mockClear();
    jobService.create.mockClear();
  });

  it('strips unknown fields such as id and createdAt before reaching the service', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      payload: {
        name: 'Alice',
        id: '99999999-9999-4999-8999-999999999999',
        createdAt: '2000-01-01T00:00:00.000Z',
        isAdmin: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(customerService.create).toHaveBeenCalledWith({ name: 'Alice' });
  });

  it(`accepts a name of exactly ${MAX_STRING_LENGTH} characters`, async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      payload: { name: 'a'.repeat(MAX_STRING_LENGTH) },
    });

    expect(response.statusCode).toBe(201);
  });

  it(`returns 400 for a name longer than ${MAX_STRING_LENGTH} characters`, async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      payload: { name: 'a'.repeat(MAX_STRING_LENGTH + 1) },
    });

    expect(response.statusCode).toBe(400);
    expect(customerService.create).not.toHaveBeenCalled();
  });

  it('returns 400 for a whitespace-only name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/customers',
      payload: { name: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(customerService.create).not.toHaveBeenCalled();
  });

  it.each([
    ['lengthMinutes 0', { lengthMinutes: 0 }],
    ['lengthMinutes above 1440', { lengthMinutes: 1441 }],
    ['recurrence interval above 99', { recurrence: { frequency: 'daily', interval: 100 } }],
  ])('returns 400 for %s', async (_label, override) => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        customerId: CUSTOMER_ID,
        locationId: LOCATION_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        date: '2026-10-01',
        startTime: '09:00',
        lengthMinutes: 60,
        ...override,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it.each([
    ['the old amount field without lineItems', { amount: 150 }],
    ['no line items', { lineItems: [] }],
    [
      'a unit price above the DECIMAL(10,2) maximum',
      { lineItems: [{ description: 'x', quantity: 1, unitPrice: 100000000 }] },
    ],
  ])('returns 400 for an invoice with %s', async (_label, override) => {
    invoiceService.generate.mockClear();

    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/invoices`,
      payload: { occurrenceDate: '2026-10-01', ...override },
    });

    expect(response.statusCode).toBe(400);
    expect(invoiceService.generate).not.toHaveBeenCalled();
  });

  it('passes invoice line items and notes to the service, stripping unknown fields', async () => {
    invoiceService.generate.mockClear();
    const body = {
      occurrenceDate: '2026-10-01',
      notes: 'Gate code 1234',
      lineItems: [{ description: 'Lawn mowing', quantity: 2, unitPrice: 45.5 }],
    };

    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/invoices`,
      payload: { ...body, amount: 91, type: 'estimate', status: 'paid' },
    });

    expect(response.statusCode).toBe(201);
    expect(invoiceService.generate).toHaveBeenCalledWith(CUSTOMER_ID, body);
  });

  it('strips unknown fields inside nested recurrence and assignees objects', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        customerId: CUSTOMER_ID,
        locationId: LOCATION_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        date: '2026-10-01',
        startTime: '09:00',
        lengthMinutes: 60,
        id: '99999999-9999-4999-8999-999999999999',
        assignees: [{ technicianId: TECHNICIAN_ID, isPrimary: true, injected: 'x' }],
        recurrence: { frequency: 'daily', endsType: 'never', injected: 'x' },
      },
    });

    expect(response.statusCode).toBe(201);
    const received = jobService.create.mock.calls[0][0];
    expect(received).not.toHaveProperty('id');
    expect(received.assignees[0]).toEqual({ technicianId: TECHNICIAN_ID, isPrimary: true });
    expect(received.recurrence).toEqual({ frequency: 'daily', endsType: 'never' });
  });
});

describe('buildApp estimate validation', () => {
  let app;

  const validEstimate = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    serviceTypeId: SERVICE_TYPE_ID,
    lineItems: [{ description: 'Lawn mowing', quantity: 2, unitPrice: 45.5 }],
  };

  beforeAll(async () => {
    app = await buildTestApp();
  }, APP_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    estimateService.create.mockClear();
    estimateService.convertToJob.mockClear();
  });

  it.each([
    ['no line items', { lineItems: [] }],
    [
      'a whitespace-only description',
      { lineItems: [{ description: '  ', quantity: 1, unitPrice: 1 }] },
    ],
    ['a quantity of 0', { lineItems: [{ description: 'x', quantity: 0, unitPrice: 1 }] }],
    ['a negative unit price', { lineItems: [{ description: 'x', quantity: 1, unitPrice: -1 }] }],
    [
      'a unit price above the DECIMAL(10,2) maximum',
      { lineItems: [{ description: 'x', quantity: 1, unitPrice: 100000000 }] },
    ],
  ])('returns 400 for %s', async (_label, override) => {
    const response = await app.inject({
      method: 'POST',
      url: '/estimates',
      payload: { ...validEstimate, ...override },
    });

    expect(response.statusCode).toBe(400);
    expect(estimateService.create).not.toHaveBeenCalled();
  });

  it('strips unknown fields such as status and line item ids before reaching the service', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/estimates',
      payload: {
        ...validEstimate,
        status: 'approved',
        lineItems: [{ ...validEstimate.lineItems[0], id: 'x', lineTotal: '0.01' }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(estimateService.create).toHaveBeenCalledWith(validEstimate);
  });

  it('returns 400 for a status outside sent/approved/declined', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/estimates/${CUSTOMER_ID}/status`,
      payload: { status: 'draft' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('does not let the convert body set the customer, location, service type or job status', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/estimates/${CUSTOMER_ID}/convert`,
      payload: {
        date: '2026-10-05',
        startTime: '09:00',
        lengthMinutes: 60,
        customerId: TECHNICIAN_ID,
        estimateId: TECHNICIAN_ID,
        status: 'canceled',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(estimateService.convertToJob).toHaveBeenCalledWith(CUSTOMER_ID, {
      date: '2026-10-05',
      startTime: '09:00',
      lengthMinutes: 60,
    });
  });
});

describe('buildApp work order validation', () => {
  let app;

  beforeAll(async () => {
    app = await buildTestApp();
  }, APP_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    workOrderService.create.mockClear();
    workOrderService.updateStatus.mockClear();
    workOrderService.updateTask.mockClear();
  });

  it('requires occurrenceDate', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/work-orders`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(workOrderService.create).not.toHaveBeenCalled();
  });

  it('accepts a notes-only work order (tasks are optional)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/work-orders`,
      payload: { occurrenceDate: '2026-10-05', notes: 'Gate code 1234' },
    });

    expect(response.statusCode).toBe(201);
    expect(workOrderService.create).toHaveBeenCalledWith(CUSTOMER_ID, {
      occurrenceDate: '2026-10-05',
      notes: 'Gate code 1234',
    });
  });

  it('strips unknown fields such as status and task ids before reaching the service', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/work-orders`,
      payload: {
        occurrenceDate: '2026-10-05',
        status: 'completed',
        tasks: [{ description: 'Mow', id: 'x', isDone: true }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(workOrderService.create).toHaveBeenCalledWith(CUSTOMER_ID, {
      occurrenceDate: '2026-10-05',
      tasks: [{ description: 'Mow' }],
    });
  });

  it('returns 400 for a blank task description', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/work-orders`,
      payload: { occurrenceDate: '2026-10-05', tasks: [{ description: '   ' }] },
    });

    expect(response.statusCode).toBe(400);
    expect(workOrderService.create).not.toHaveBeenCalled();
  });

  it('returns 400 for a status outside in_progress/completed/canceled', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/work-orders/${CUSTOMER_ID}/status`,
      payload: { status: 'dispatched' },
    });

    expect(response.statusCode).toBe(400);
    expect(workOrderService.updateStatus).not.toHaveBeenCalled();
  });

  it('updates a task’s isDone flag', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/work-orders/${CUSTOMER_ID}/tasks/${LOCATION_ID}`,
      payload: { isDone: true },
    });

    expect(response.statusCode).toBe(200);
    expect(workOrderService.updateTask).toHaveBeenCalledWith(CUSTOMER_ID, LOCATION_ID, true);
  });

  it('returns 400 when isDone is missing', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/work-orders/${CUSTOMER_ID}/tasks/${LOCATION_ID}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(workOrderService.updateTask).not.toHaveBeenCalled();
  });
});

describe('buildApp request date range (1900-01-01 to 2099-12-31)', () => {
  let app;

  const job = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    serviceTypeId: SERVICE_TYPE_ID,
    startTime: '09:00',
    lengthMinutes: 60,
  };

  const postJob = (payload) => app.inject({ method: 'POST', url: '/jobs', payload });

  beforeAll(async () => {
    app = await buildTestApp();
  }, APP_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jobService.create.mockClear();
    invoiceService.generate.mockClear();
  });

  it.each(['0000-01-01', '0050-01-01', '1899-12-31', '2100-01-01'])(
    'rejects job date %s',
    async (date) => {
      const response = await postJob({ ...job, date });

      expect(response.statusCode).toBe(400);
      expect(jobService.create).not.toHaveBeenCalled();
    },
  );

  it.each(['1900-01-01', '2099-12-31'])('accepts job date %s', async (date) => {
    const response = await postJob({ ...job, date });

    expect(response.statusCode).toBe(201);
  });

  it('rejects a recurrence endsOnDate outside the range', async () => {
    const response = await postJob({
      ...job,
      date: '2026-10-01',
      recurrence: { frequency: 'daily', endsType: 'on_date', endsOnDate: '2100-01-01' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an occurrences query date outside the range', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/jobs/${CUSTOMER_ID}/occurrences?to=2100-01-01`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an invoice occurrenceDate outside the range', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/invoices`,
      payload: {
        occurrenceDate: '1899-12-31',
        lineItems: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(invoiceService.generate).not.toHaveBeenCalled();
  });
});

describe('buildApp strict body types, nulls and trimming', () => {
  let app;

  const customer = (payload) => app.inject({ method: 'POST', url: '/customers', payload });
  const job = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    serviceTypeId: SERVICE_TYPE_ID,
    date: '2026-10-01',
    startTime: '09:00',
    lengthMinutes: 60,
  };

  beforeAll(async () => {
    app = await buildTestApp();
  }, APP_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    customerService.create.mockClear();
    jobService.create.mockClear();
    jobService.list.mockClear();
    jobService.getOccurrences.mockClear();
    estimateService.create.mockClear();
  });

  it.each([
    ['a number for a string (name: 123)', { name: 123 }],
    ['a boolean for a string (name: true)', { name: true }],
    ['null for a required string (name: null)', { name: null }],
  ])('rejects %s in a body', async (_label, payload) => {
    const response = await customer(payload);

    expect(response.statusCode).toBe(400);
    expect(customerService.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a numeric string for an integer (lengthMinutes: "60")', { lengthMinutes: '60' }],
    ['a string for a boolean (isLocked: "true")', { isLocked: 'true' }],
    [
      'a single value where an array is expected (weeklyDaysOfWeek: 1)',
      { recurrence: { frequency: 'weekly', weeklyPeriod: 'every', weeklyDaysOfWeek: 1 } },
    ],
  ])('rejects %s in a job body', async (_label, override) => {
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: { ...job, ...override },
    });

    expect(response.statusCode).toBe(400);
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it('rejects a numeric string line-item quantity', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/estimates',
      payload: {
        customerId: CUSTOMER_ID,
        locationId: LOCATION_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        lineItems: [{ description: 'Mow', quantity: '2', unitPrice: 10 }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(estimateService.create).not.toHaveBeenCalled();
  });

  it('accepts null in optional text fields and passes it through as null', async () => {
    const response = await customer({ name: 'Alice', email: null, phone: null });

    expect(response.statusCode).toBe(201);
    expect(customerService.create).toHaveBeenCalledWith({
      name: 'Alice',
      email: null,
      phone: null,
    });
  });

  it('accepts null estimate notes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/estimates',
      payload: {
        customerId: CUSTOMER_ID,
        locationId: LOCATION_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        notes: null,
        lineItems: [{ description: 'Mow', quantity: 1, unitPrice: 10 }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(estimateService.create.mock.calls[0][0].notes).toBeNull();
  });

  it('trims strings, including nested line-item descriptions, before validation', async () => {
    await customer({ name: '  Alice  ', email: ' alice@example.com ' });
    await app.inject({
      method: 'POST',
      url: '/estimates',
      payload: {
        customerId: CUSTOMER_ID,
        locationId: LOCATION_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        notes: '  call first  ',
        lineItems: [{ description: '  Mow  ', quantity: 1, unitPrice: 10 }],
      },
    });

    expect(customerService.create).toHaveBeenCalledWith({
      name: 'Alice',
      email: 'alice@example.com',
    });
    const estimate = estimateService.create.mock.calls[0][0];
    expect(estimate.notes).toBe('call first');
    expect(estimate.lineItems[0].description).toBe('Mow');
  });

  it('still rejects a whitespace-only name after trimming, with the blank-value message', async () => {
    const response = await customer({ name: '   ' });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('body/name must NOT have fewer than 1 characters');
  });

  it('stores blank optional text as null', async () => {
    const response = await customer({ name: 'Alice', email: '', phone: '   ' });

    expect(response.statusCode).toBe(201);
    expect(customerService.create).toHaveBeenCalledWith({
      name: 'Alice',
      email: null,
      phone: null,
    });
  });

  it('turns blank estimate notes into null', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/estimates',
      payload: {
        customerId: CUSTOMER_ID,
        locationId: LOCATION_ID,
        serviceTypeId: SERVICE_TYPE_ID,
        notes: '  ',
        lineItems: [{ description: 'Mow', quantity: 1, unitPrice: 10 }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(estimateService.create.mock.calls[0][0].notes).toBeNull();
  });

  it('keeps coercing query strings (?page=2&pageSize=5)', async () => {
    const response = await app.inject({ method: 'GET', url: '/jobs?page=2&pageSize=5' });

    expect(response.statusCode).toBe(200);
    expect(jobService.list).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
  });

  it('keeps coercing the occurrences limit query (?limit=3)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/jobs/${CUSTOMER_ID}/occurrences?limit=3`,
    });

    expect(response.statusCode).toBe(200);
    expect(jobService.getOccurrences).toHaveBeenCalledWith(CUSTOMER_ID, {
      from: undefined,
      to: undefined,
      limit: 3,
    });
  });
});
