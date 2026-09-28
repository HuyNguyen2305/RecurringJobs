import { jest } from '@jest/globals';

// The transaction object handed to callbacks, so tests can assert it is passed through.
const TRANSACTION = { id: 'tx-1' };

const fakeSequelize = {
  transaction: jest.fn(async (callback) => callback(TRANSACTION)),
};

jest.unstable_mockModule('#common/database.js', () => ({
  sequelize: fakeSequelize,
}));

const { EstimateService } = await import('#service/estimate.service.js');
const { NotFoundError, ValidationError, ConflictError } = await import('#common/error.js');

function estimateRow(overrides = {}) {
  const row = {
    id: 'estimate-1',
    type: 'estimate',
    customerId: 'customer-1',
    locationId: 'location-1',
    serviceTypeId: 'service-type-1',
    status: 'draft',
    notes: null,
    jobId: null,
    jobSnapshot: null,
    ...overrides,
  };
  return { ...row, toJSON: () => row };
}

function buildService(overrides = {}) {
  const service = Object.create(EstimateService.prototype);
  Object.assign(service, {
    estimateRepository: {
      create: jest.fn(async () => ({ id: 'estimate-1' })),
      findById: jest.fn(async () => estimateRow()),
      findByIdForUpdate: jest.fn(async () => estimateRow({ status: 'approved' })),
      transitionStatus: jest.fn(async () => 1),
      linkJob: jest.fn(async () => 1),
    },
    customerLineItemRepository: {
      bulkCreate: jest.fn(async () => []),
      findAllForParent: jest.fn(async () => []),
    },
    customerRepository: {
      findById: jest.fn(async () => ({ id: 'customer-1' })),
    },
    locationRepository: {
      findById: jest.fn(async () => ({ id: 'location-1', customerId: 'customer-1' })),
    },
    serviceTypeRepository: {
      findById: jest.fn(async () => ({ id: 'service-type-1' })),
    },
    jobService: {
      create: jest.fn(async (data) => ({
        id: 'job-1',
        date: '2026-10-05',
        startTime: '09:00:00',
        lengthMinutes: 60,
        customer: { name: 'William Saliba' },
        location: { addressLine1: 'Wall Street' },
        serviceType: { name: 'Blank Service' },
        ...data,
      })),
    },
    ...overrides,
  });
  return service;
}

const baseEstimateData = {
  customerId: 'customer-1',
  locationId: 'location-1',
  serviceTypeId: 'service-type-1',
  lineItems: [
    { description: 'Lawn mowing', quantity: 2, unitPrice: 45.5 },
    { description: 'Hedge trim', quantity: 1, unitPrice: 30 },
  ],
};

beforeEach(() => {
  fakeSequelize.transaction.mockClear();
});

describe('EstimateService#create', () => {
  it('creates the estimate and its line items in one transaction', async () => {
    const service = buildService();

    await service.create(baseEstimateData);

    expect(fakeSequelize.transaction).toHaveBeenCalledTimes(1);
    const { lineItems, ...estimateData } = baseEstimateData;
    expect(service.estimateRepository.create).toHaveBeenCalledWith(estimateData, {
      transaction: TRANSACTION,
    });
    expect(service.customerLineItemRepository.bulkCreate).toHaveBeenCalledWith(
      lineItems.map((item, position) => ({ parentId: 'estimate-1', ...item, position })),
      { transaction: TRANSACTION },
    );
  });

  it('throws NotFoundError when the customer does not exist', async () => {
    const service = buildService({
      customerRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.create(baseEstimateData)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when the service type does not exist', async () => {
    const service = buildService({
      serviceTypeRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.create(baseEstimateData)).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when the location belongs to another customer', async () => {
    const service = buildService({
      locationRepository: {
        findById: jest.fn(async () => ({ id: 'location-1', customerId: 'other-customer' })),
      },
    });

    await expect(service.create(baseEstimateData)).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when a unit price has more than 2 decimals', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseEstimateData,
        lineItems: [{ description: 'x', quantity: 1, unitPrice: 9.999 }],
      }),
    ).rejects.toThrow(ValidationError);
    expect(fakeSequelize.transaction).not.toHaveBeenCalled();
  });

  it('throws ValidationError when a quantity is 0', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseEstimateData,
        lineItems: [{ description: 'x', quantity: 0, unitPrice: 1 }],
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('EstimateService#getById', () => {
  it('throws NotFoundError when the estimate does not exist', async () => {
    const service = buildService({
      estimateRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
  });

  it('returns line totals and a total computed exactly in cents', async () => {
    const service = buildService({
      customerLineItemRepository: {
        findAllForParent: jest.fn(async () => [
          { id: 'li-1', description: 'a', quantity: '3.00', unitPrice: '0.10', position: 0 },
          { id: 'li-2', description: 'b', quantity: '1.50', unitPrice: '0.33', position: 1 },
          { id: 'li-3', description: 'c', quantity: '2.00', unitPrice: '45.50', position: 2 },
        ]),
      },
    });

    const estimate = await service.getById('estimate-1');

    expect(service.customerLineItemRepository.findAllForParent).toHaveBeenCalledWith('estimate-1');
    // 3 x 0.10 = 0.30 (not 0.30000000000000004); 1.5 x 0.33 = 0.495 -> 0.50 (half-up)
    expect(estimate.lineItems.map((item) => item.lineTotal)).toEqual(['0.30', '0.50', '91.00']);
    expect(estimate.total).toBe('91.80');
  });

  it('returns a total of 0.00 when there are no line items', async () => {
    const service = buildService();

    await expect(service.getById('estimate-1')).resolves.toMatchObject({ total: '0.00' });
  });
});

describe('EstimateService#updateStatus', () => {
  it.each([
    ['draft', 'sent'],
    ['sent', 'approved'],
    ['sent', 'declined'],
  ])('moves an estimate from %s to %s', async (from, to) => {
    const service = buildService();
    service.estimateRepository.findById = jest.fn(async () => estimateRow({ status: from }));

    await service.updateStatus('estimate-1', to);

    expect(service.estimateRepository.transitionStatus).toHaveBeenCalledWith(
      'estimate-1',
      from,
      to,
    );
  });

  it.each([
    ['draft', 'approved'],
    ['approved', 'sent'],
    ['declined', 'approved'],
    ['approved', 'declined'],
    ['sent', 'sent'],
  ])('throws ConflictError moving from %s to %s', async (from, to) => {
    const service = buildService();
    service.estimateRepository.findById = jest.fn(async () => estimateRow({ status: from }));

    await expect(service.updateStatus('estimate-1', to)).rejects.toThrow(ConflictError);
    expect(service.estimateRepository.transitionStatus).not.toHaveBeenCalled();
  });

  it('throws ConflictError when a concurrent request changed the status first', async () => {
    const service = buildService();
    service.estimateRepository.findById = jest.fn(async () => estimateRow({ status: 'sent' }));
    service.estimateRepository.transitionStatus = jest.fn(async () => 0);

    await expect(service.updateStatus('estimate-1', 'approved')).rejects.toThrow(ConflictError);
  });
});

describe('EstimateService#convertToJob', () => {
  const jobData = { date: '2026-10-05', startTime: '09:00', lengthMinutes: 60 };

  it('locks the estimate, creates the job and links it, all in one transaction', async () => {
    const service = buildService();

    const job = await service.convertToJob('estimate-1', jobData);

    expect(fakeSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(service.estimateRepository.findByIdForUpdate).toHaveBeenCalledWith('estimate-1', {
      transaction: TRANSACTION,
    });
    expect(service.jobService.create).toHaveBeenCalledWith(
      {
        ...jobData,
        customerId: 'customer-1',
        locationId: 'location-1',
        serviceTypeId: 'service-type-1',
      },
      { transaction: TRANSACTION },
    );
    expect(service.estimateRepository.linkJob).toHaveBeenCalledWith(
      'estimate-1',
      'job-1',
      expect.objectContaining({
        customerId: 'customer-1',
        customerName: 'William Saliba',
        date: '2026-10-05',
        lengthMinutes: 60,
      }),
      { transaction: TRANSACTION },
    );
    expect(job.id).toBe('job-1');
  });

  it('throws NotFoundError when the estimate does not exist', async () => {
    const service = buildService();
    service.estimateRepository.findByIdForUpdate = jest.fn(async () => null);

    await expect(service.convertToJob('missing', jobData)).rejects.toThrow(NotFoundError);
  });

  it.each(['draft', 'sent', 'declined'])(
    'throws ConflictError for an estimate that is %s',
    async (status) => {
      const service = buildService();
      service.estimateRepository.findByIdForUpdate = jest.fn(async () => estimateRow({ status }));

      await expect(service.convertToJob('estimate-1', jobData)).rejects.toThrow(ConflictError);
      expect(service.jobService.create).not.toHaveBeenCalled();
    },
  );

  it('throws ConflictError when the estimate was already converted', async () => {
    const service = buildService();
    service.estimateRepository.findByIdForUpdate = jest.fn(async () =>
      estimateRow({ status: 'approved', jobId: 'job-0', jobSnapshot: {} }),
    );

    await expect(service.convertToJob('estimate-1', jobData)).rejects.toThrow(ConflictError);
    expect(service.jobService.create).not.toHaveBeenCalled();
  });

  it('propagates a job creation error without linking, so the transaction rolls back', async () => {
    const service = buildService();
    service.jobService.create = jest.fn(async () => Promise.reject(new ValidationError('bad')));

    await expect(service.convertToJob('estimate-1', jobData)).rejects.toThrow(ValidationError);
    expect(service.estimateRepository.linkJob).not.toHaveBeenCalled();
  });
});
