import { jest } from '@jest/globals';

const fakeSequelize = {
  transaction: jest.fn(async (callback) => callback({})),
};

jest.unstable_mockModule('#common/database.js', () => ({
  sequelize: fakeSequelize,
}));

const { JobService } = await import('#service/job.service.js');
const { NotFoundError, ValidationError } = await import('#common/error.js');

function buildService(overrides = {}) {
  const service = Object.create(JobService.prototype);
  Object.assign(service, {
    jobRepository: {
      create: jest.fn(async () => ({ id: 'job-1' })),
      findById: jest.fn(async () => ({ id: 'job-1' })),
    },
    jobAssigneeRepository: {
      bulkCreate: jest.fn(async () => []),
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
    technicianRepository: {
      findById: jest.fn(async () => ({ id: 'technician-1' })),
    },
    ...overrides,
  });
  return service;
}

const baseJobData = {
  customerId: 'customer-1',
  locationId: 'location-1',
  serviceTypeId: 'service-type-1',
  date: '2026-10-01',
  startTime: '12:30',
  lengthMinutes: 30,
};

beforeEach(() => {
  fakeSequelize.transaction.mockClear();
});

describe('JobService#create', () => {
  it('creates a job and its assignees within a transaction', async () => {
    const service = buildService();

    const result = await service.create({
      ...baseJobData,
      assignees: [{ technicianId: 'technician-1', isPrimary: true }],
    });

    expect(service.jobRepository.create).toHaveBeenCalledWith(baseJobData, {
      transaction: expect.anything(),
    });
    expect(service.jobAssigneeRepository.bulkCreate).toHaveBeenCalledWith(
      [{ jobId: 'job-1', technicianId: 'technician-1', isPrimary: true }],
      { transaction: expect.anything() },
    );
    expect(result).toEqual({ id: 'job-1' });
  });

  it('throws NotFoundError when the customer does not exist', async () => {
    const service = buildService({
      customerRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.create(baseJobData)).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when the location does not belong to the customer', async () => {
    const service = buildService({
      locationRepository: {
        findById: jest.fn(async () => ({ id: 'location-1', customerId: 'other-customer' })),
      },
    });

    await expect(service.create(baseJobData)).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when more than one assignee is marked primary', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        assignees: [
          { technicianId: 'technician-1', isPrimary: true },
          { technicianId: 'technician-1', isPrimary: true },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('embeds the recurrence object directly on the job', async () => {
    const service = buildService();

    await service.create({
      ...baseJobData,
      recurrence: { frequency: 'daily', interval: 2 },
    });

    expect(service.jobRepository.create).toHaveBeenCalledWith(
      { ...baseJobData, recurrence: { frequency: 'daily', interval: 2, endsType: 'never' } },
      { transaction: expect.anything() },
    );
  });

  it('throws ValidationError when weekly recurrence has no days of week', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        recurrence: { frequency: 'weekly', weeklyPeriod: 'every' },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when endsType=after has no endsAfterCount', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        recurrence: { frequency: 'daily', endsType: 'after' },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when except=month has no months', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        recurrence: { frequency: 'daily', exceptType: 'month' },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when except=condition has no day of week', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        recurrence: { frequency: 'daily', exceptType: 'condition', exceptConditionEvery: 'week' },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when except=condition/month has no period', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        recurrence: {
          frequency: 'daily',
          exceptType: 'condition',
          exceptConditionEvery: 'month',
          exceptConditionDayOfWeek: 0,
        },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when except=frequency has no exceptJobId', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        recurrence: { frequency: 'daily', exceptType: 'frequency' },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when the except job does not exist', async () => {
    const service = buildService({
      jobRepository: {
        create: jest.fn(async () => ({ id: 'job-1' })),
        findById: jest.fn(async () => null),
      },
    });

    await expect(
      service.create({
        ...baseJobData,
        recurrence: { frequency: 'daily', exceptType: 'frequency', exceptJobId: 'other-job' },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('embeds except=frequency fields in the recurrence object', async () => {
    const service = buildService();

    await service.create({
      ...baseJobData,
      recurrence: { frequency: 'daily', exceptType: 'frequency', exceptJobId: 'other-job' },
    });

    expect(service.jobRepository.create).toHaveBeenCalledWith(
      {
        ...baseJobData,
        recurrence: {
          frequency: 'daily',
          exceptType: 'frequency',
          exceptJobId: 'other-job',
          endsType: 'never',
          interval: 1,
        },
      },
      { transaction: expect.anything() },
    );
  });
});

describe('JobService#getOccurrences', () => {
  it('returns just the job date when there is no recurrence', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async () => ({ id: 'job-1', date: '2026-10-01', recurrence: null })),
      },
    });

    await expect(service.getOccurrences('job-1')).resolves.toEqual(['2026-10-01']);
  });

  it('expands the recurrence object into occurrence dates', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async () => ({
          id: 'job-1',
          date: '2026-10-01',
          recurrence: { frequency: 'daily', interval: 1, endsType: 'never' },
        })),
      },
    });

    await expect(service.getOccurrences('job-1', { limit: 3 })).resolves.toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('excludes the except job’s occurrences when exceptType=frequency', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async (id) => {
          if (id === 'job-1') {
            return {
              id: 'job-1',
              date: '2026-10-01',
              recurrence: {
                frequency: 'daily',
                interval: 1,
                endsType: 'never',
                exceptType: 'frequency',
                exceptJobId: 'other-job',
              },
            };
          }
          return { id: 'other-job', date: '2026-10-01', recurrence: null };
        }),
      },
    });

    await expect(service.getOccurrences('job-1', { limit: 3 })).resolves.toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });
});

describe('JobService#getById', () => {
  it('throws NotFoundError when the job does not exist', async () => {
    const service = buildService({
      jobRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.getById('missing-id')).rejects.toThrow(NotFoundError);
  });

  it('returns the job when found', async () => {
    const service = buildService();

    await expect(service.getById('job-1')).resolves.toEqual({ id: 'job-1' });
  });
});
