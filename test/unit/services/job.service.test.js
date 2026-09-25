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

  it('throws ValidationError when the same technician is assigned twice', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        assignees: [
          { technicianId: 'technician-1', isPrimary: true },
          { technicianId: 'technician-1', isPrimary: false },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when timeWindowStart is after timeWindowEnd', async () => {
    const service = buildService();

    await expect(
      service.create({ ...baseJobData, timeWindowStart: '17:00', timeWindowEnd: '08:00' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when timeWindowStart equals timeWindowEnd in mixed formats', async () => {
    const service = buildService();

    await expect(
      service.create({ ...baseJobData, timeWindowStart: '08:00', timeWindowEnd: '08:00:00' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when weeklyDaysOfWeek has duplicates', async () => {
    const service = buildService();

    await expect(
      service.create({
        ...baseJobData,
        recurrence: {
          frequency: 'weekly',
          weeklyPeriod: 'every',
          weeklyDaysOfWeek: [1, 1],
        },
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

  it('composes a nested Except->Frequency chain (C excepts B, B excepts A)', async () => {
    const jobs = {
      'job-a': {
        id: 'job-a',
        date: '2026-10-01',
        recurrence: { frequency: 'daily', interval: 1, endsType: 'never' },
      },
      'job-b': {
        id: 'job-b',
        date: '2026-10-01',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          endsType: 'never',
          exceptType: 'frequency',
          exceptJobId: 'job-a',
        },
      },
      'job-c': {
        id: 'job-c',
        date: '2026-10-01',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          endsType: 'never',
          exceptType: 'frequency',
          exceptJobId: 'job-b',
        },
      },
    };
    const service = buildService({
      jobRepository: { findById: jest.fn(async (id) => jobs[id]) },
    });

    // A's 1st date (10-01) is excluded from B, so B's 1st visible date is 10-02;
    // B's 1st visible date (10-02) is excluded from C, so C's 1st visible date is 10-01.
    await expect(service.getOccurrences('job-c', { limit: 1 })).resolves.toEqual(['2026-10-01']);
  });

  it('does not infinite-loop on a circular Except->Frequency reference', async () => {
    const jobs = {
      'job-x': {
        id: 'job-x',
        date: '2026-10-01',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          endsType: 'never',
          exceptType: 'frequency',
          exceptJobId: 'job-y',
        },
      },
      'job-y': {
        id: 'job-y',
        date: '2026-10-01',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          endsType: 'never',
          exceptType: 'frequency',
          exceptJobId: 'job-x',
        },
      },
    };
    const service = buildService({
      jobRepository: { findById: jest.fn(async (id) => jobs[id]) },
    });

    // Y's back-reference to X is cut by the cycle guard, so Y is every day and X excludes
    // all of it; the backfill loop must still terminate.
    await expect(service.getOccurrences('job-x', { limit: 1 })).resolves.toEqual([]);
  });

  it('returns no dates for a one-off job outside the from/to window', async () => {
    const service = buildService({
      jobRepository: {
        findById: jest.fn(async () => ({ id: 'job-1', date: '2026-10-01', recurrence: null })),
      },
    });

    await expect(
      service.getOccurrences('job-1', { from: '2026-11-01', to: '2026-11-30' }),
    ).resolves.toEqual([]);
  });

  it('applies the except job over the whole range even when only a limit is given', async () => {
    const jobs = {
      'job-a': {
        id: 'job-a',
        date: '2026-10-01',
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          weeklyPeriod: 'every',
          weeklyDaysOfWeek: [1],
          endsType: 'never',
          exceptType: 'frequency',
          exceptJobId: 'job-b',
        },
      },
      'job-b': {
        id: 'job-b',
        date: '2026-10-01',
        recurrence: { frequency: 'daily', interval: 1, endsType: 'never' },
      },
    };
    const service = buildService({
      jobRepository: { findById: jest.fn(async (id) => jobs[id]) },
    });

    await expect(service.getOccurrences('job-a', { limit: 3 })).resolves.toEqual([]);
  });

  it('resolves a bounded job that excepts a never-ending job without a to or limit', async () => {
    const jobs = {
      'job-a': {
        id: 'job-a',
        date: '2026-10-01',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          endsType: 'on_date',
          endsOnDate: '2026-10-05',
          exceptType: 'frequency',
          exceptJobId: 'job-b',
        },
      },
      'job-b': {
        id: 'job-b',
        date: '2026-10-03',
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          weeklyPeriod: 'every',
          weeklyDaysOfWeek: [6],
          endsType: 'never',
        },
      },
    };
    const service = buildService({
      jobRepository: { findById: jest.fn(async (id) => jobs[id]) },
    });

    // 2026-10-03 is a Saturday, B's first date
    await expect(service.getOccurrences('job-a')).resolves.toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-04',
      '2026-10-05',
    ]);
  });

  it('backfills the limit past dates removed by the except job', async () => {
    const jobs = {
      'job-a': {
        id: 'job-a',
        date: '2026-10-01',
        recurrence: {
          frequency: 'daily',
          interval: 1,
          endsType: 'never',
          exceptType: 'frequency',
          exceptJobId: 'job-b',
        },
      },
      'job-b': {
        id: 'job-b',
        date: '2026-10-01',
        recurrence: { frequency: 'daily', interval: 1, endsType: 'after', endsAfterCount: 3 },
      },
    };
    const service = buildService({
      jobRepository: { findById: jest.fn(async (id) => jobs[id]) },
    });

    await expect(service.getOccurrences('job-a', { limit: 3 })).resolves.toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
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
