import { jest } from '@jest/globals';
import { MAX_STRING_LENGTH } from '#constants/validation.js';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_TYPE_ID = '33333333-3333-4333-8333-333333333333';
const TECHNICIAN_ID = '44444444-4444-4444-8444-444444444444';

const customerService = { create: jest.fn(async (data) => ({ id: CUSTOMER_ID, ...data })) };
const jobService = { create: jest.fn(async (data) => ({ id: 'job-1', ...data })) };
const invoiceService = { generate: jest.fn(async () => ({ id: 'invoice-1' })) };

jest.unstable_mockModule('#service/customer.service.js', () => ({
  CustomerService: jest.fn(() => customerService),
}));
jest.unstable_mockModule('#service/job.service.js', () => ({
  JobService: jest.fn(() => jobService),
}));
jest.unstable_mockModule('#service/invoice.service.js', () => ({
  InvoiceService: jest.fn(() => invoiceService),
}));

const { buildApp } = await import('../../src/app.js');

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
  });

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
  });

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

  it('returns 400 for an invoice amount above the DECIMAL(10,2) maximum', async () => {
    invoiceService.generate.mockClear();

    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${CUSTOMER_ID}/invoices`,
      payload: { occurrenceDate: '2026-10-01', amount: 100000000 },
    });

    expect(response.statusCode).toBe(400);
    expect(invoiceService.generate).not.toHaveBeenCalled();
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
