import { jest } from '@jest/globals';

const fakeSequelize = {
  transaction: jest.fn(async (callback) => callback({})),
};

jest.unstable_mockModule('#common/database.js', () => ({
  sequelize: fakeSequelize,
}));

const { InvoiceService } = await import('#service/invoice.service.js');
const { NotFoundError, ValidationError, ConflictError } = await import('#common/error.js');

const LINE_ITEMS = [
  { description: 'Lawn mowing', quantity: 2, unitPrice: 45.5 },
  { description: 'Fertilizer', quantity: 3, unitPrice: 0.1 },
];

function jobRow(overrides = {}) {
  return {
    id: 'job-1',
    customerId: 'customer-1',
    locationId: 'location-1',
    serviceTypeId: 'service-type-1',
    date: '2026-10-01',
    startTime: '12:30:00',
    lengthMinutes: 30,
    status: 'unconfirmed',
    recurrence: null,
    customer: { name: 'William Saliba' },
    location: { addressLine1: 'Wall Street' },
    serviceType: { name: 'Blank Service' },
    ...overrides,
  };
}

function invoiceRow(overrides = {}) {
  const row = { id: 'invoice-1', type: 'invoice', occurrenceDate: '2026-10-01', ...overrides };
  return { ...row, toJSON: () => row };
}

function buildService(overrides = {}) {
  const service = Object.create(InvoiceService.prototype);
  Object.assign(service, {
    invoiceRepository: {
      create: jest.fn(async (data) => ({ id: 'invoice-1', ...data })),
      findByJobAndDate: jest.fn(async () => null),
      findById: jest.fn(async () => invoiceRow()),
      findAllForJob: jest.fn(async () => []),
    },
    customerLineItemRepository: {
      bulkCreate: jest.fn(async () => []),
      findAllForParent: jest.fn(async () => []),
      findAllForParents: jest.fn(async () => []),
    },
    jobRepository: {
      findById: jest.fn(async () => jobRow()),
    },
    jobOccurrenceService: {
      assertAvailableFor: jest.fn(async () => undefined),
    },
    jobService: {
      getOccurrences: jest.fn(async () => []),
    },
    ...overrides,
  });
  return service;
}

beforeEach(() => {
  fakeSequelize.transaction.mockClear();
});

describe('InvoiceService#generate', () => {
  // Pins "today" so the 14-days-ahead rule is deterministic: the limit is 2026-10-09.
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function oneOffJobOn(date, extra = {}) {
    return { jobRepository: { findById: jest.fn(async () => jobRow({ date, ...extra })) } };
  }

  it('throws NotFoundError when the job does not exist', async () => {
    const service = buildService({
      jobRepository: { findById: jest.fn(async () => null) },
    });

    await expect(
      service.generate('missing-job', { occurrenceDate: '2026-10-01', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(NotFoundError);
  });

  it('creates the invoice with ids and a snapshot from the job, plus its line items, in one transaction', async () => {
    const service = buildService();

    await service.generate('job-1', {
      occurrenceDate: '2026-10-01',
      lineItems: LINE_ITEMS,
      notes: 'Gate code 1234',
    });

    expect(fakeSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(service.invoiceRepository.create).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        locationId: 'location-1',
        serviceTypeId: 'service-type-1',
        notes: 'Gate code 1234',
        jobId: 'job-1',
        occurrenceDate: '2026-10-01',
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
      },
      { transaction: expect.anything() },
    );
    expect(service.customerLineItemRepository.bulkCreate).toHaveBeenCalledWith(
      LINE_ITEMS.map((item, position) => ({ parentId: 'invoice-1', ...item, position })),
      { transaction: expect.anything() },
    );
  });

  it('throws ValidationError when occurrenceDate does not match a non-recurring job date', async () => {
    const service = buildService();

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-08', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when occurrenceDate is not a real occurrence of a recurring job', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async () =>
          jobRow({
            recurrence: { frequency: 'weekly', weeklyPeriod: 'every', weeklyDaysOfWeek: [4] },
          }),
        ),
      },
      jobService: { getOccurrences: jest.fn(async () => []) },
    });

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-02', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(ValidationError);
  });

  it('asks the occurrence service whether the occurrence can be invoiced (completed is allowed)', async () => {
    const service = buildService();

    await service.generate('job-1', { occurrenceDate: '2026-10-01', lineItems: LINE_ITEMS });

    expect(service.jobOccurrenceService.assertAvailableFor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      '2026-10-01',
      { action: 'generate an invoice', allowCompleted: true },
    );
  });

  it('creates nothing when the occurrence service refuses the occurrence', async () => {
    const service = buildService({
      jobOccurrenceService: {
        assertAvailableFor: jest.fn(async () => {
          throw new ValidationError('Cannot generate an invoice for a canceled occurrence');
        }),
      },
    });

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-01', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(ValidationError);
    expect(service.invoiceRepository.create).not.toHaveBeenCalled();
  });

  it('accepts the date a rescheduled visit was moved to', async () => {
    // The job is a one-off on 2026-10-01; its visit was moved to 2026-10-05.
    const service = buildService({
      jobOccurrenceRepository: {
        findByJobAndDate: jest.fn(async () => ({
          status: 'unconfirmed',
          rescheduledFrom: '2026-10-01',
        })),
      },
    });

    await service.generate('job-1', { occurrenceDate: '2026-10-05', lineItems: LINE_ITEMS });

    expect(service.invoiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ occurrenceDate: '2026-10-05' }),
      expect.anything(),
    );
  });

  it('accepts a valid occurrence date for a recurring job', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async () =>
          jobRow({
            recurrence: { frequency: 'weekly', weeklyPeriod: 'every', weeklyDaysOfWeek: [4] },
          }),
        ),
      },
      jobService: { getOccurrences: jest.fn(async () => ['2026-10-08']) },
    });

    await service.generate('job-1', { occurrenceDate: '2026-10-08', lineItems: LINE_ITEMS });

    expect(service.jobService.getOccurrences).toHaveBeenCalledWith('job-1', {
      from: '2026-10-08',
      to: '2026-10-08',
    });
    expect(service.invoiceRepository.create).toHaveBeenCalled();
  });

  it('throws ConflictError when the occurrence already has an invoice', async () => {
    const service = buildService();
    service.invoiceRepository.findByJobAndDate = jest.fn(async () => ({ id: 'existing' }));

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-01', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(ConflictError);
    expect(service.invoiceRepository.create).not.toHaveBeenCalled();
  });

  it('maps a lost race on the one-invoice-per-occurrence index to ConflictError', async () => {
    const uniqueError = Object.assign(new Error('duplicate'), {
      name: 'SequelizeUniqueConstraintError',
      parent: { constraint: 'customer_documents_invoice_occurrence_unique' },
    });
    const service = buildService();
    service.invoiceRepository.create = jest.fn(async () => Promise.reject(uniqueError));

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-01', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(ConflictError);
  });

  it('throws ValidationError for a canceled job and creates nothing', async () => {
    const service = buildService(oneOffJobOn('2026-10-01', { status: 'canceled' }));

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-01', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(ValidationError);
    expect(service.invoiceRepository.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError when occurrenceDate is more than 14 days ahead', async () => {
    const service = buildService(oneOffJobOn('2026-10-10'));

    await expect(
      service.generate('job-1', { occurrenceDate: '2026-10-10', lineItems: LINE_ITEMS }),
    ).rejects.toThrow(ValidationError);
    expect(service.invoiceRepository.create).not.toHaveBeenCalled();
  });

  it('accepts an occurrenceDate exactly 14 days ahead', async () => {
    const service = buildService(oneOffJobOn('2026-10-09'));

    await service.generate('job-1', { occurrenceDate: '2026-10-09', lineItems: LINE_ITEMS });

    expect(service.invoiceRepository.create).toHaveBeenCalled();
  });

  it('accepts a past occurrenceDate', async () => {
    const service = buildService(oneOffJobOn('2026-09-01'));

    await service.generate('job-1', { occurrenceDate: '2026-09-01', lineItems: LINE_ITEMS });

    expect(service.invoiceRepository.create).toHaveBeenCalled();
  });

  it('throws ValidationError when a unit price has more than 2 decimal places', async () => {
    const service = buildService();

    await expect(
      service.generate('job-1', {
        occurrenceDate: '2026-10-01',
        lineItems: [{ description: 'x', quantity: 1, unitPrice: 12.345 }],
      }),
    ).rejects.toThrow(ValidationError);
    expect(service.invoiceRepository.create).not.toHaveBeenCalled();
  });
});

describe('InvoiceService#getById', () => {
  it('throws NotFoundError when the invoice does not exist', async () => {
    const service = buildService({
      invoiceRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.getById('missing-id')).rejects.toThrow(NotFoundError);
  });

  it('returns the invoice with its line items and a total computed in cents', async () => {
    const service = buildService();
    service.customerLineItemRepository.findAllForParent = jest.fn(async () => [
      { id: 'li-1', description: 'a', quantity: '3.00', unitPrice: '0.10', position: 0 },
      { id: 'li-2', description: 'b', quantity: '2.00', unitPrice: '45.50', position: 1 },
    ]);

    const invoice = await service.getById('invoice-1');

    expect(service.customerLineItemRepository.findAllForParent).toHaveBeenCalledWith('invoice-1');
    expect(invoice).toMatchObject({ id: 'invoice-1', total: '91.30' });
    expect(invoice.lineItems.map((item) => item.lineTotal)).toEqual(['0.30', '91.00']);
  });
});

describe('InvoiceService#listForJob', () => {
  it('returns an empty list without querying line items when the job has no invoices', async () => {
    const service = buildService();

    await expect(service.listForJob('job-1')).resolves.toEqual([]);
    expect(service.customerLineItemRepository.findAllForParents).not.toHaveBeenCalled();
  });

  it('loads every invoice’s line items in one query and totals each invoice separately', async () => {
    const service = buildService();
    service.invoiceRepository.findAllForJob = jest.fn(async () => [
      invoiceRow({ id: 'invoice-2', occurrenceDate: '2026-10-08' }),
      invoiceRow({ id: 'invoice-1', occurrenceDate: '2026-10-01' }),
    ]);
    service.customerLineItemRepository.findAllForParents = jest.fn(async () => [
      {
        id: 'a',
        parentId: 'invoice-1',
        description: 'a',
        quantity: '1',
        unitPrice: '10',
        position: 0,
      },
      {
        id: 'b',
        parentId: 'invoice-2',
        description: 'b',
        quantity: '2',
        unitPrice: '5',
        position: 0,
      },
      {
        id: 'c',
        parentId: 'invoice-2',
        description: 'c',
        quantity: '1',
        unitPrice: '0.5',
        position: 1,
      },
    ]);

    const invoices = await service.listForJob('job-1');

    expect(service.customerLineItemRepository.findAllForParents).toHaveBeenCalledTimes(1);
    expect(service.customerLineItemRepository.findAllForParents).toHaveBeenCalledWith([
      'invoice-2',
      'invoice-1',
    ]);
    expect(invoices.map((invoice) => [invoice.id, invoice.total])).toEqual([
      ['invoice-2', '10.50'],
      ['invoice-1', '10.00'],
    ]);
  });
});
