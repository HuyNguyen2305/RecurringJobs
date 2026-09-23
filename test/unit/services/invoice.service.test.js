import { jest } from '@jest/globals';
import { InvoiceService } from '#service/invoice.service.js';
import { NotFoundError, ValidationError, ConflictError } from '#common/error.js';

function buildService(overrides = {}) {
  const service = Object.create(InvoiceService.prototype);
  Object.assign(service, {
    invoiceRepository: {
      create: jest.fn(async (data) => ({ id: 'invoice-1', ...data })),
      findByJobAndDate: jest.fn(async () => null),
      findById: jest.fn(async () => ({ id: 'invoice-1' })),
      findAllForJob: jest.fn(async () => []),
    },
    jobRepository: {
      findById: jest.fn(async () => ({
        id: 'job-1',
        customerId: 'customer-1',
        locationId: 'location-1',
        serviceTypeId: 'service-type-1',
        date: '2026-10-01',
        startTime: '12:30:00',
        lengthMinutes: 30,
        recurrence: null,
        customer: { name: 'William Saliba' },
        location: { addressLine1: 'Wall Street' },
        serviceType: { name: 'Blank Service' },
      })),
    },
    jobService: {
      getOccurrences: jest.fn(async () => []),
    },
    ...overrides,
  });
  return service;
}

describe('InvoiceService#generate', () => {
  it('throws NotFoundError when the job does not exist', async () => {
    const service = buildService({
      jobRepository: { findById: jest.fn(async () => null) },
    });

    await expect(
      service.generate('missing-job', { occurrenceDate: '2026-10-01', amount: 100 }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when occurrenceDate does not match a non-recurring job date', async () => {
    const service = buildService();

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-08', amount: 100 }),
    ).rejects.toThrow(ValidationError);
  });

  it('accepts a matching date for a non-recurring job', async () => {
    const service = buildService();

    const invoice = await service.generate('job-1', {
      occurrenceDate: '2026-10-01',
      amount: 100,
    });

    expect(invoice).toMatchObject({
      jobId: 'job-1',
      occurrenceDate: '2026-10-01',
      amount: 100,
      jobSnapshot: {
        customerId: 'customer-1',
        customerName: 'William Saliba',
        locationId: 'location-1',
        locationAddress: 'Wall Street',
        serviceTypeId: 'service-type-1',
        serviceTypeName: 'Blank Service',
        date: '2026-10-01',
        startTime: '12:30:00',
        lengthMinutes: 30,
      },
    });
  });

  it('throws ValidationError when occurrenceDate is not a real occurrence of a recurring job', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async () => ({
          id: 'job-1',
          date: '2026-10-01',
          recurrence: { frequency: 'weekly', weeklyPeriod: 'every', weeklyDaysOfWeek: [4] },
        })),
      },
      jobService: { getOccurrences: jest.fn(async () => []) },
    });

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-02', amount: 100 }),
    ).rejects.toThrow(ValidationError);
  });

  it('accepts a valid occurrence date for a recurring job', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async () => ({
          id: 'job-1',
          date: '2026-10-01',
          recurrence: { frequency: 'weekly', weeklyPeriod: 'every', weeklyDaysOfWeek: [4] },
          customer: {},
          location: {},
          serviceType: {},
        })),
      },
      jobService: { getOccurrences: jest.fn(async () => ['2026-10-08']) },
    });

    const invoice = await service.generate('job-1', {
      occurrenceDate: '2026-10-08',
      amount: 50,
    });

    expect(service.jobService.getOccurrences).toHaveBeenCalledWith('job-1', {
      from: '2026-10-08',
      to: '2026-10-08',
    });
    expect(invoice).toMatchObject({ occurrenceDate: '2026-10-08', amount: 50 });
  });

  it('throws ConflictError when the occurrence already has an invoice', async () => {
    const service = buildService({
      invoiceRepository: {
        create: jest.fn(),
        findByJobAndDate: jest.fn(async () => ({ id: 'existing-invoice' })),
      },
    });

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-01', amount: 100 }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('InvoiceService#getById', () => {
  it('throws NotFoundError when the invoice does not exist', async () => {
    const service = buildService({
      invoiceRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
  });
});
