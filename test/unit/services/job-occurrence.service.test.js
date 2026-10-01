import { jest } from '@jest/globals';

jest.unstable_mockModule('#common/dates.js', () => ({
  todayUtc: () => '2026-10-10',
}));

const TRANSACTION = { id: 'tx-1' };
const fakeSequelize = {
  transaction: jest.fn(async (callback) => callback(TRANSACTION)),
};
jest.unstable_mockModule('#common/database.js', () => ({ sequelize: fakeSequelize }));

const { JobOccurrenceService } = await import('#service/job-occurrence.service.js');
const { ValidationError, ConflictError } = await import('#common/error.js');
const { generateOccurrences } = await import('#common/recurrence-engine.js');

const DAILY_DATES = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];

function jobRow(overrides = {}) {
  return {
    id: 'job-1',
    date: '2026-10-09',
    status: 'unconfirmed',
    recurrence: { frequency: 'daily' },
    ...overrides,
  };
}

// `statuses` maps a date to its job_occurrences row: a status string, or an object
// { status, rescheduledTo, rescheduledFrom } for a row that is part of a reschedule.
function buildService({ job = jobRow(), dates = DAILY_DATES, statuses = {}, overrides = {} } = {}) {
  const rows = Object.entries(statuses).map(([occurrenceDate, value]) => {
    const spec = typeof value === 'string' ? { status: value } : value;
    return {
      id: `row-${occurrenceDate}`,
      occurrenceDate,
      status: spec.status,
      rescheduledTo: spec.rescheduledTo ?? (spec.status === 'rescheduled' ? '2026-12-01' : null),
      rescheduledFrom: spec.rescheduledFrom ?? null,
    };
  });
  const service = Object.create(JobOccurrenceService.prototype);
  Object.assign(service, {
    jobOccurrenceRepository: {
      findAllForJob: jest.fn(async (jobId, { to } = {}) =>
        rows.filter((row) => !to || row.occurrenceDate <= to),
      ),
      findByJobAndDate: jest.fn(
        async (jobId, date) => rows.find((row) => row.occurrenceDate === date) ?? null,
      ),
      create: jest.fn(async (data) => ({ id: 'new-row', ...data })),
      transitionStatus: jest.fn(async () => 1),
    },
    jobService: {
      getById: jest.fn(async () => job),
      resolveOccurrences: jest.fn(async (_job, { to }) =>
        dates.filter((date) => !to || date <= to),
      ),
      getOccurrences: jest.fn(async (_id, { from, to }) =>
        dates.filter((date) => date >= from && date <= to),
      ),
    },
    ...overrides,
  });
  return service;
}

const states = (items) => items.map((item) => `${item.date}:${item.state}`);

beforeEach(() => {
  fakeSequelize.transaction.mockClear();
});

describe('JobOccurrenceService#getSchedule', () => {
  it('shows the first occurrence as real and the rest as hollow while nothing is completed', async () => {
    // First occurrence is today, so it is not overdue yet.
    const service = buildService({
      job: jobRow({ date: '2026-10-10' }),
      dates: DAILY_DATES.slice(1),
    });

    const items = await service.getSchedule('job-1');

    expect(states(items)).toEqual([
      '2026-10-10:real',
      '2026-10-11:hollow',
      '2026-10-12:hollow',
      '2026-10-13:hollow',
    ]);
  });

  it('makes the next occurrence real once the previous one is completed', async () => {
    const service = buildService({
      job: jobRow({ date: '2026-10-10' }),
      dates: DAILY_DATES.slice(1),
      statuses: { '2026-10-10': 'completed' },
    });

    const items = await service.getSchedule('job-1');

    expect(states(items)).toEqual([
      '2026-10-10:real',
      '2026-10-11:real',
      '2026-10-12:hollow',
      '2026-10-13:hollow',
    ]);
  });

  it('drops every later occurrence when an open occurrence is overdue', async () => {
    const service = buildService(); // 2026-10-09 is before today (10-10) and still unconfirmed

    const items = await service.getSchedule('job-1');

    expect(states(items)).toEqual(['2026-10-09:overdue']);
  });

  it('keeps the series going after a canceled occurrence', async () => {
    const service = buildService({
      statuses: { '2026-10-09': 'canceled' },
    });

    const items = await service.getSchedule('job-1');

    // 10-10 is today (not overdue), so it is real; the rest are hollow.
    expect(states(items)).toEqual([
      '2026-10-09:real',
      '2026-10-10:real',
      '2026-10-11:hollow',
      '2026-10-12:hollow',
      '2026-10-13:hollow',
    ]);
  });

  it('shows a rescheduled occurrence with its new date and continues the series', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'rescheduled' } });

    const items = await service.getSchedule('job-1');

    expect(items[0]).toMatchObject({
      date: '2026-10-09',
      status: 'rescheduled',
      rescheduledTo: '2026-12-01',
    });
    expect(items[1]).toMatchObject({ date: '2026-10-10', state: 'real' });
  });

  it('ends the series at a terminated occurrence', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'terminate_service' } });

    const items = await service.getSchedule('job-1');

    expect(states(items)).toEqual(['2026-10-09:real']);
    expect(items[0].status).toBe('terminate_service');
  });

  it('includes completedAt on each item (null unless the row has one)', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'completed' } });
    service.jobOccurrenceRepository.findAllForJob.mockResolvedValue([
      {
        id: 'row-1',
        occurrenceDate: '2026-10-09',
        status: 'completed',
        rescheduledTo: null,
        completedAt: new Date('2026-10-09T17:00:00Z'),
      },
    ]);

    const items = await service.getSchedule('job-1', { limit: 2 });

    expect(items[0].completedAt).toEqual(new Date('2026-10-09T17:00:00Z'));
    expect(items[1].completedAt).toBeNull();
  });

  it('uses the job status for the first occurrence when it has no row', async () => {
    const service = buildService({ job: jobRow({ status: 'completed' }) });

    const items = await service.getSchedule('job-1');

    expect(items[0]).toMatchObject({ date: '2026-10-09', status: 'completed', state: 'real' });
    expect(items[1]).toMatchObject({ date: '2026-10-10', state: 'real' });
  });

  describe('default status of an occurrence without a row', () => {
    // Today is 2026-10-10, so a series starting then is not overdue. The first occurrence takes
    // the job's own status; later ones inherit it only while it is unconfirmed or confirmed.
    it.each([
      ['unconfirmed', 'unconfirmed', 'unconfirmed'],
      ['confirmed', 'confirmed', 'confirmed'],
      ['in_progress', 'in_progress', 'unconfirmed'],
      ['completed', 'completed', 'unconfirmed'],
      ['canceled', 'canceled', 'unconfirmed'],
      ['terminate_service', 'terminate_service', null],
    ])('job status %s -> first %s, later %s', async (jobStatus, first, later) => {
      const service = buildService({
        job: jobRow({ date: '2026-10-10', status: jobStatus }),
        dates: DAILY_DATES.slice(1),
      });

      const items = await service.getSchedule('job-1', { limit: 3 });

      expect(items[0].status).toBe(first);
      // A job-level terminate_service ends the series at the first occurrence.
      expect(items[1]?.status ?? null).toBe(later);
    });
  });

  it('trims the result with from and limit but still walks from the series start', async () => {
    const service = buildService({
      statuses: { '2026-10-09': 'completed', '2026-10-10': 'completed' },
    });

    const items = await service.getSchedule('job-1', { from: '2026-10-11', limit: 2 });

    expect(states(items)).toEqual(['2026-10-11:real', '2026-10-12:hollow']);
  });
});

describe('JobOccurrenceService#updateStatus', () => {
  it('creates the occurrence row on the first status change', async () => {
    const service = buildService({
      job: jobRow({ date: '2026-10-10' }),
      dates: DAILY_DATES.slice(1),
    });

    const result = await service.updateStatus('job-1', '2026-10-10', { status: 'completed' });

    expect(service.jobOccurrenceRepository.create).toHaveBeenCalledWith({
      jobId: 'job-1',
      occurrenceDate: '2026-10-10',
      status: 'completed',
      rescheduledTo: null,
      completedAt: expect.any(Date),
    });
    expect(result).toEqual({
      jobId: 'job-1',
      date: '2026-10-10',
      status: 'completed',
      rescheduledTo: null,
      completedAt: expect.any(Date),
    });
  });

  it('stamps completedAt with the current time only when completing', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-10T08:30:00Z') });
    try {
      const completing = buildService({
        job: jobRow({ date: '2026-10-10' }),
        dates: DAILY_DATES.slice(1),
      });
      await completing.updateStatus('job-1', '2026-10-10', { status: 'completed' });
      expect(completing.jobOccurrenceRepository.create.mock.calls[0][0].completedAt).toEqual(
        new Date('2026-10-10T08:30:00Z'),
      );

      const other = buildService({
        job: jobRow({ date: '2026-10-10' }),
        dates: DAILY_DATES.slice(1),
      });
      const result = await other.updateStatus('job-1', '2026-10-10', { status: 'canceled' });
      expect(other.jobOccurrenceRepository.create.mock.calls[0][0].completedAt).toBeNull();
      expect(result.completedAt).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('sets completedAt in the compare-and-set when completing an existing row', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'in_progress' } });

    await service.updateStatus('job-1', '2026-10-09', { status: 'completed' });

    expect(service.jobOccurrenceRepository.transitionStatus).toHaveBeenCalledWith(
      'row-2026-10-09',
      ['unconfirmed', 'confirmed', 'in_progress'],
      { status: 'completed', rescheduledTo: null, completedAt: expect.any(Date) },
    );
  });

  it('updates an existing row with a compare-and-set from only the statuses that may move to the target', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'confirmed' } });

    await service.updateStatus('job-1', '2026-10-09', { status: 'in_progress' });

    expect(service.jobOccurrenceRepository.transitionStatus).toHaveBeenCalledWith(
      'row-2026-10-09',
      ['unconfirmed', 'confirmed'],
      { status: 'in_progress', rescheduledTo: null, completedAt: null },
    );
  });

  describe('completing an occurrence', () => {
    // Today is 2026-10-10 (mocked). The job starts tomorrow, so its first occurrence is in the future.
    const futureJob = () =>
      buildService({ job: jobRow({ date: '2026-10-11' }), dates: DAILY_DATES.slice(2) });

    it('rejects completing an occurrence before its date and writes nothing', async () => {
      const service = futureJob();

      await expect(
        service.updateStatus('job-1', '2026-10-11', { status: 'completed' }),
      ).rejects.toThrow(ValidationError);
      expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
      expect(service.jobOccurrenceRepository.transitionStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['today', '2026-10-10', DAILY_DATES.slice(1)],
      ['a past date', '2026-10-09', DAILY_DATES],
    ])('allows completing %s', async (_name, date, dates) => {
      const service = buildService({ job: jobRow({ date }), dates });

      await expect(
        service.updateStatus('job-1', date, { status: 'completed' }),
      ).resolves.toMatchObject({ status: 'completed' });
    });

    it.each([
      ['confirmed', {}],
      ['in_progress', {}],
      ['canceled', {}],
      ['rescheduled', { rescheduledTo: '2026-10-20' }],
      ['terminate_service', {}],
    ])('still allows %s before the date', async (status, extra) => {
      const service = futureJob();

      await expect(
        service.updateStatus('job-1', '2026-10-11', { status, ...extra }),
      ).resolves.toMatchObject({ status });
    });
  });

  describe('status transitions', () => {
    const OPEN = ['unconfirmed', 'confirmed', 'in_progress'];
    const TARGETS = [
      'confirmed',
      'in_progress',
      'completed',
      'canceled',
      'rescheduled',
      'terminate_service',
    ];
    // Open statuses only move forward; any open status can move to a final one.
    const ALLOWED = new Set([
      'unconfirmed>confirmed',
      'unconfirmed>in_progress',
      'confirmed>in_progress',
      ...OPEN.flatMap((from) =>
        ['completed', 'canceled', 'rescheduled', 'terminate_service'].map((to) => `${from}>${to}`),
      ),
    ]);

    it.each(OPEN.flatMap((from) => TARGETS.map((to) => [from, to])))(
      '%s -> %s',
      async (from, to) => {
        // The first occurrence takes its status from the job, so no row is needed.
        const service = buildService({ job: jobRow({ status: from }) });
        const body = {
          status: to,
          ...(to === 'rescheduled' ? { rescheduledTo: '2026-10-20' } : {}),
        };

        const result = service.updateStatus('job-1', '2026-10-09', body);

        if (ALLOWED.has(`${from}>${to}`)) {
          await expect(result).resolves.toMatchObject({ status: to });
          expect(service.jobOccurrenceRepository.create).toHaveBeenCalled();
        } else {
          await expect(result).rejects.toThrow(ConflictError);
          expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
        }
      },
    );

    it('never accepts unconfirmed as a target', async () => {
      const service = buildService({ job: jobRow({ status: 'confirmed' }) });

      await expect(
        service.updateStatus('job-1', '2026-10-09', { status: 'unconfirmed' }),
      ).rejects.toThrow(ConflictError);
    });

    it('rejects a backward move on an existing row without writing', async () => {
      const service = buildService({ statuses: { '2026-10-09': 'in_progress' } });

      await expect(
        service.updateStatus('job-1', '2026-10-09', { status: 'confirmed' }),
      ).rejects.toThrow(ConflictError);
      expect(service.jobOccurrenceRepository.transitionStatus).not.toHaveBeenCalled();
    });
  });

  it('lets a later occurrence of a confirmed job move on from confirmed, not back to it', async () => {
    const confirmedJob = () =>
      buildService({
        job: jobRow({ date: '2026-10-09', status: 'confirmed' }),
        statuses: { '2026-10-09': 'completed' },
      });

    await expect(
      confirmedJob().updateStatus('job-1', '2026-10-10', { status: 'confirmed' }),
    ).rejects.toThrow(ConflictError);
    await expect(
      confirmedJob().updateStatus('job-1', '2026-10-10', { status: 'in_progress' }),
    ).resolves.toMatchObject({ status: 'in_progress' });
  });

  it('rejects a date that is not an occurrence of the job', async () => {
    const service = buildService();

    await expect(
      service.updateStatus('job-1', '2027-01-01', { status: 'completed' }),
    ).rejects.toThrow(ValidationError);
  });

  it('requires rescheduledTo for rescheduled, and forbids it for other statuses', async () => {
    const service = buildService();

    await expect(
      service.updateStatus('job-1', '2026-10-09', { status: 'rescheduled' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.updateStatus('job-1', '2026-10-09', {
        status: 'rescheduled',
        rescheduledTo: '2026-10-09',
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.updateStatus('job-1', '2026-10-09', {
        status: 'completed',
        rescheduledTo: '2026-11-01',
      }),
    ).rejects.toThrow(ValidationError);
  });

  describe('rescheduledTo rules', () => {
    // Today is 2026-10-10 (mocked). The series has two dates: 10-08 (the occurrence being moved)
    // and 10-15; endsType is set per test.
    const SERIES = ['2026-10-08', '2026-10-15'];
    const reschedule = (service, rescheduledTo) =>
      service.updateStatus('job-1', '2026-10-08', { status: 'rescheduled', rescheduledTo });
    const buildSeries = (recurrence, statuses = {}) =>
      buildService({
        job: jobRow({ date: '2026-10-08', recurrence }),
        dates: SERIES,
        statuses,
      });
    const never = { frequency: 'daily', interval: 1, endsType: 'never' };

    it.each([
      ['equal to the occurrence date', '2026-10-08'],
      ['before the occurrence date', '2026-10-07'],
    ])('rejects a rescheduledTo %s (400)', async (_name, target) => {
      const service = buildSeries(never);

      await expect(reschedule(service, target)).rejects.toThrow(ValidationError);
      expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a rescheduledTo in the past even when it is after the occurrence (400)', async () => {
      const service = buildSeries(never);

      await expect(reschedule(service, '2026-10-09')).rejects.toThrow(ValidationError);
      expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
    });

    it.each([
      ['today', '2026-10-10'],
      ['a later free date', '2026-10-12'],
    ])('accepts %s', async (_name, target) => {
      const service = buildSeries(never);

      await expect(reschedule(service, target)).resolves.toMatchObject({ rescheduledTo: target });
    });

    it('rejects a date that is already an occurrence of the series (409)', async () => {
      const service = buildSeries(never);

      await expect(reschedule(service, '2026-10-15')).rejects.toThrow(ConflictError);
      expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a date that already has an occurrence row, e.g. another reschedule target (409)', async () => {
      const service = buildSeries(never, { '2026-10-12': 'confirmed' });

      await expect(reschedule(service, '2026-10-12')).rejects.toThrow(ConflictError);
      expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a date after the end of an on_date series (400) but accepts the end date', async () => {
      const rule = { ...never, endsType: 'on_date', endsOnDate: '2026-10-31' };

      await expect(reschedule(buildSeries(rule), '2026-11-02')).rejects.toThrow(ValidationError);
      await expect(reschedule(buildSeries(rule), '2026-10-31')).resolves.toMatchObject({
        rescheduledTo: '2026-10-31',
      });
    });

    it('rejects a date after the last occurrence of an after-N series (400) but accepts one before it', async () => {
      const rule = { ...never, endsType: 'after', endsAfterCount: 2 };

      await expect(reschedule(buildSeries(rule), '2026-10-16')).rejects.toThrow(ValidationError);
      await expect(reschedule(buildSeries(rule), '2026-10-12')).resolves.toMatchObject({
        rescheduledTo: '2026-10-12',
      });
    });

    it('has no end limit for a never-ending series or a non-recurring job', async () => {
      await expect(reschedule(buildSeries(never), '2030-01-01')).resolves.toMatchObject({
        rescheduledTo: '2030-01-01',
      });
      const oneOff = buildService({
        job: jobRow({ date: '2026-10-08', recurrence: null }),
        dates: ['2026-10-08'],
      });
      await expect(reschedule(oneOff, '2030-01-01')).resolves.toMatchObject({
        rescheduledTo: '2030-01-01',
      });
    });

    it('checks the target before the occurrence is gated, so a bad target is a 400', async () => {
      // 10-15 is hollow (10-08 is open), but the bad target is reported first.
      const service = buildSeries(never);

      await expect(
        service.updateStatus('job-1', '2026-10-15', {
          status: 'rescheduled',
          rescheduledTo: '2026-10-14',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  it('stores rescheduledTo when rescheduling', async () => {
    const service = buildService();

    await service.updateStatus('job-1', '2026-10-09', {
      status: 'rescheduled',
      rescheduledTo: '2026-10-20',
    });

    expect(service.jobOccurrenceRepository.create.mock.calls[0][0]).toMatchObject({
      status: 'rescheduled',
      rescheduledTo: '2026-10-20',
    });
  });

  it('rejects changing an occurrence whose predecessor is still open (hollow)', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'confirmed' } });

    await expect(
      service.updateStatus('job-1', '2026-10-10', { status: 'completed' }),
    ).rejects.toThrow(ConflictError);
    expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
  });

  it('allows changing an occurrence once its predecessor is settled', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'canceled' } });

    await service.updateStatus('job-1', '2026-10-10', { status: 'completed' });

    expect(service.jobOccurrenceRepository.create).toHaveBeenCalled();
  });

  it('rejects any occurrence after a terminated one', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'terminate_service' } });

    await expect(
      service.updateStatus('job-1', '2026-10-10', { status: 'completed' }),
    ).rejects.toThrow(/terminated/);
  });

  it.each(['completed', 'canceled', 'rescheduled', 'terminate_service'])(
    'rejects changing an occurrence that is already %s',
    async (current) => {
      const service = buildService({ statuses: { '2026-10-09': current } });

      await expect(
        service.updateStatus('job-1', '2026-10-09', { status: 'confirmed' }),
      ).rejects.toThrow(ConflictError);
      expect(service.jobOccurrenceRepository.transitionStatus).not.toHaveBeenCalled();
    },
  );

  it('treats a job-level completed status as final for the first occurrence', async () => {
    const service = buildService({ job: jobRow({ status: 'completed' }) });

    await expect(
      service.updateStatus('job-1', '2026-10-09', { status: 'confirmed' }),
    ).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when a concurrent change wins the compare-and-set', async () => {
    const service = buildService({ statuses: { '2026-10-09': 'confirmed' } });
    service.jobOccurrenceRepository.transitionStatus.mockResolvedValue(0);

    await expect(
      service.updateStatus('job-1', '2026-10-09', { status: 'completed' }),
    ).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when a concurrent request creates the row first', async () => {
    const service = buildService();
    service.jobOccurrenceRepository.create.mockRejectedValue(
      Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError' }),
    );

    await expect(
      service.updateStatus('job-1', '2026-10-09', { status: 'completed' }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('a rescheduled visit is its own occurrence', () => {
  // Today is 2026-10-10. The series is 10-09 .. 10-13; 10-09 was moved to 10-20.
  const MOVED = {
    '2026-10-09': { status: 'rescheduled', rescheduledTo: '2026-10-20' },
    '2026-10-20': { status: 'unconfirmed', rescheduledFrom: '2026-10-09' },
  };
  const detail = (items) => items.map((item) => `${item.date}:${item.state}:${item.status}`);

  describe('getSchedule', () => {
    it('shows the moved visit right after the original and gates the next occurrence on it', async () => {
      const service = buildService({ statuses: MOVED });

      const items = await service.getSchedule('job-1', { limit: 5 });

      expect(detail(items)).toEqual([
        '2026-10-09:real:rescheduled',
        '2026-10-20:real:unconfirmed',
        '2026-10-10:hollow:unconfirmed',
        '2026-10-11:hollow:unconfirmed',
        '2026-10-12:hollow:unconfirmed',
      ]);
      expect(items[1]).toMatchObject({ rescheduledFrom: '2026-10-09', rescheduledTo: null });
      expect(items[0].rescheduledFrom).toBeNull();
    });

    it.each(['completed', 'canceled'])(
      'makes the next occurrence real once the moved visit is %s',
      async (status) => {
        const service = buildService({
          statuses: { ...MOVED, '2026-10-20': { status, rescheduledFrom: '2026-10-09' } },
        });

        const items = await service.getSchedule('job-1', { limit: 4 });

        expect(detail(items).slice(1, 4)).toEqual([
          `2026-10-20:real:${status}`,
          '2026-10-10:real:unconfirmed',
          '2026-10-11:hollow:unconfirmed',
        ]);
      },
    );

    it('treats a moved visit whose day has passed as overdue and drops everything after it', async () => {
      const service = buildService({
        job: jobRow({ date: '2026-10-05' }),
        dates: ['2026-10-05', '2026-10-12'],
        statuses: {
          '2026-10-05': { status: 'rescheduled', rescheduledTo: '2026-10-08' },
          '2026-10-08': { status: 'confirmed', rescheduledFrom: '2026-10-05' },
        },
      });

      const items = await service.getSchedule('job-1');

      expect(detail(items)).toEqual([
        '2026-10-05:real:rescheduled',
        '2026-10-08:overdue:confirmed',
      ]);
    });

    it('follows a chain of reschedules to the last visit', async () => {
      const service = buildService({
        statuses: {
          ...MOVED,
          '2026-10-20': {
            status: 'rescheduled',
            rescheduledFrom: '2026-10-09',
            rescheduledTo: '2026-10-25',
          },
          '2026-10-25': { status: 'unconfirmed', rescheduledFrom: '2026-10-20' },
        },
      });

      const items = await service.getSchedule('job-1', { limit: 4 });

      expect(detail(items)).toEqual([
        '2026-10-09:real:rescheduled',
        '2026-10-20:real:rescheduled',
        '2026-10-25:real:unconfirmed',
        '2026-10-10:hollow:unconfirmed',
      ]);
    });

    it('ends the series when the moved visit is terminated', async () => {
      const service = buildService({
        statuses: {
          ...MOVED,
          '2026-10-20': { status: 'terminate_service', rescheduledFrom: '2026-10-09' },
        },
      });

      const items = await service.getSchedule('job-1');

      expect(detail(items)).toEqual([
        '2026-10-09:real:rescheduled',
        '2026-10-20:real:terminate_service',
      ]);
    });

    it('keeps the old behaviour for a rescheduled row that has no moved visit', async () => {
      const service = buildService({ statuses: { '2026-10-09': 'rescheduled' } });

      const items = await service.getSchedule('job-1', { limit: 3 });

      expect(detail(items)).toEqual([
        '2026-10-09:real:rescheduled',
        '2026-10-10:real:unconfirmed',
        '2026-10-11:hollow:unconfirmed',
      ]);
    });

    it('loads every row, so a moved visit beyond `to` still gates the window and is not returned', async () => {
      const service = buildService({ statuses: MOVED });

      const items = await service.getSchedule('job-1', { to: '2026-10-13' });

      expect(detail(items)).toEqual([
        '2026-10-09:real:rescheduled',
        '2026-10-10:hollow:unconfirmed',
        '2026-10-11:hollow:unconfirmed',
        '2026-10-12:hollow:unconfirmed',
        '2026-10-13:hollow:unconfirmed',
      ]);
    });
  });

  describe('updateStatus', () => {
    it('writes the rescheduled occurrence and its moved visit in one transaction', async () => {
      const service = buildService();

      await service.updateStatus('job-1', '2026-10-09', {
        status: 'rescheduled',
        rescheduledTo: '2026-10-20',
      });

      expect(fakeSequelize.transaction).toHaveBeenCalledTimes(1);
      const { create } = service.jobOccurrenceRepository;
      expect(create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          jobId: 'job-1',
          occurrenceDate: '2026-10-09',
          status: 'rescheduled',
          rescheduledTo: '2026-10-20',
        }),
        { transaction: TRANSACTION },
      );
      expect(create).toHaveBeenNthCalledWith(
        2,
        { jobId: 'job-1', occurrenceDate: '2026-10-20', rescheduledFrom: '2026-10-09' },
        { transaction: TRANSACTION },
      );
    });

    it('updates an existing row inside the same transaction when rescheduling it', async () => {
      const service = buildService({ statuses: { '2026-10-09': 'confirmed' } });

      await service.updateStatus('job-1', '2026-10-09', {
        status: 'rescheduled',
        rescheduledTo: '2026-10-20',
      });

      expect(service.jobOccurrenceRepository.transitionStatus).toHaveBeenCalledWith(
        'row-2026-10-09',
        ['unconfirmed', 'confirmed', 'in_progress'],
        expect.objectContaining({ status: 'rescheduled', rescheduledTo: '2026-10-20' }),
        { transaction: TRANSACTION },
      );
      expect(service.jobOccurrenceRepository.create).toHaveBeenCalledWith(
        { jobId: 'job-1', occurrenceDate: '2026-10-20', rescheduledFrom: '2026-10-09' },
        { transaction: TRANSACTION },
      );
    });

    it('answers 409 and rolls back when the target date is taken concurrently', async () => {
      const service = buildService();
      service.jobOccurrenceRepository.create
        .mockResolvedValueOnce({ id: 'original' })
        .mockRejectedValueOnce(
          Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError' }),
        );

      await expect(
        service.updateStatus('job-1', '2026-10-09', {
          status: 'rescheduled',
          rescheduledTo: '2026-10-20',
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('does not open a transaction for other statuses', async () => {
      const service = buildService();

      await service.updateStatus('job-1', '2026-10-09', { status: 'canceled' });

      expect(fakeSequelize.transaction).not.toHaveBeenCalled();
    });

    it('lets a moved visit be updated like any occurrence', async () => {
      const service = buildService({ statuses: MOVED });

      await service.updateStatus('job-1', '2026-10-20', { status: 'confirmed' });

      expect(service.jobOccurrenceRepository.transitionStatus).toHaveBeenCalledWith(
        'row-2026-10-20',
        ['unconfirmed'],
        expect.objectContaining({ status: 'confirmed' }),
      );
    });

    it('applies the completion rule to the moved visit by its own date', async () => {
      const service = buildService({ statuses: MOVED });

      // 2026-10-20 is after today (2026-10-10).
      await expect(
        service.updateStatus('job-1', '2026-10-20', { status: 'completed' }),
      ).rejects.toThrow(ValidationError);
    });

    it('can reschedule a moved visit again, which chains a new visit', async () => {
      const service = buildService({ statuses: MOVED });

      await service.updateStatus('job-1', '2026-10-20', {
        status: 'rescheduled',
        rescheduledTo: '2026-10-25',
      });

      expect(service.jobOccurrenceRepository.create).toHaveBeenCalledWith(
        { jobId: 'job-1', occurrenceDate: '2026-10-25', rescheduledFrom: '2026-10-20' },
        { transaction: TRANSACTION },
      );
    });

    it('blocks the next series occurrence while the moved visit is open (409)', async () => {
      const service = buildService({ statuses: MOVED });

      await expect(
        service.updateStatus('job-1', '2026-10-10', { status: 'canceled' }),
      ).rejects.toThrow(/not available yet/);
    });

    it('blocks the next series occurrence while the end of a reschedule chain is open', async () => {
      const service = buildService({
        statuses: {
          ...MOVED,
          '2026-10-20': {
            status: 'rescheduled',
            rescheduledFrom: '2026-10-09',
            rescheduledTo: '2026-10-25',
          },
          '2026-10-25': { status: 'confirmed', rescheduledFrom: '2026-10-20' },
        },
      });

      await expect(
        service.updateStatus('job-1', '2026-10-10', { status: 'canceled' }),
      ).rejects.toThrow(ConflictError);
    });

    it('allows the next series occurrence once the moved visit is completed', async () => {
      const service = buildService({
        statuses: {
          ...MOVED,
          '2026-10-20': { status: 'completed', rescheduledFrom: '2026-10-09' },
        },
      });

      await expect(
        service.updateStatus('job-1', '2026-10-10', { status: 'completed' }),
      ).resolves.toMatchObject({ status: 'completed' });
    });

    it('reports a terminated series when the moved visit was terminated', async () => {
      const service = buildService({
        statuses: {
          ...MOVED,
          '2026-10-20': { status: 'terminate_service', rescheduledFrom: '2026-10-09' },
        },
      });

      await expect(
        service.updateStatus('job-1', '2026-10-10', { status: 'canceled' }),
      ).rejects.toThrow(/terminated/);
    });

    it('still lets the next occurrence move after a legacy rescheduled row with no moved visit', async () => {
      const service = buildService({ statuses: { '2026-10-09': 'rescheduled' } });

      await expect(
        service.updateStatus('job-1', '2026-10-10', { status: 'canceled' }),
      ).resolves.toMatchObject({ status: 'canceled' });
    });

    it('rejects a second occurrence rescheduling to a date that already holds a moved visit (409)', async () => {
      const service = buildService({
        statuses: { '2026-10-09': 'canceled' },
        dates: ['2026-10-09', '2026-10-10', '2026-10-11'],
      });
      service.jobOccurrenceRepository.findByJobAndDate.mockImplementation(async (_id, date) => {
        if (date === '2026-10-20') {
          return { occurrenceDate: date, rescheduledFrom: '2026-10-09' };
        }
        return date === '2026-10-09' ? { id: 'row', status: 'canceled' } : null;
      });

      await expect(
        service.updateStatus('job-1', '2026-10-10', {
          status: 'rescheduled',
          rescheduledTo: '2026-10-20',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });
});

describe('JobOccurrenceService#assertAvailableFor', () => {
  // Today is 2026-10-10 (mocked). The series is 10-09 .. 10-13 and the first occurrence is 10-09.
  const FIRST = '2026-10-09';
  const check = (service, date, options = {}) =>
    service.assertAvailableFor(jobRow(), date, { action: 'create a work order', ...options });

  describe('status of the occurrence', () => {
    it.each(['unconfirmed', 'confirmed', 'in_progress'])(
      'allows a %s occurrence, with or without allowCompleted',
      async (status) => {
        const service = buildService({ statuses: { [FIRST]: status } });

        await expect(check(service, FIRST)).resolves.toBeUndefined();
        await expect(check(service, FIRST, { allowCompleted: true })).resolves.toBeUndefined();
      },
    );

    it('allows a completed occurrence only when allowCompleted is set', async () => {
      const service = buildService({ statuses: { [FIRST]: 'completed' } });

      await expect(check(service, FIRST)).rejects.toThrow(ValidationError);
      await expect(check(service, FIRST, { allowCompleted: true })).resolves.toBeUndefined();
    });

    it.each(['canceled', 'rescheduled', 'terminate_service'])(
      'blocks a %s occurrence even with allowCompleted (400)',
      async (status) => {
        const service = buildService({ statuses: { [FIRST]: status } });

        await expect(check(service, FIRST)).rejects.toThrow(ValidationError);
        await expect(check(service, FIRST, { allowCompleted: true })).rejects.toThrow(
          ValidationError,
        );
      },
    );

    it('names the action and the status in the message', async () => {
      const service = buildService({ statuses: { [FIRST]: 'canceled' } });

      await expect(check(service, FIRST, { action: 'generate an invoice' })).rejects.toThrow(
        'Cannot generate an invoice for a canceled occurrence (2026-10-09)',
      );
    });

    it('uses the job status for the first occurrence when it has no row', async () => {
      const service = buildService({ job: jobRow({ status: 'terminate_service' }) });

      await expect(
        service.assertAvailableFor(jobRow({ status: 'terminate_service' }), FIRST, {
          action: 'create a work order',
          allowCompleted: true,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('does not let a later occurrence inherit a one-off job status', async () => {
      // The job is completed, but 10-10 is a later occurrence with no row: unconfirmed.
      const job = jobRow({ status: 'completed' });
      const service = buildService({ job, statuses: { [FIRST]: 'completed' } });

      await expect(
        service.assertAvailableFor(job, '2026-10-10', { action: 'create a work order' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('hollow occurrences', () => {
    it('blocks an occurrence whose predecessor is still open (409)', async () => {
      const service = buildService({ statuses: { [FIRST]: 'confirmed' } });

      await expect(check(service, '2026-10-10')).rejects.toThrow(ConflictError);
      await expect(check(service, '2026-10-10', { allowCompleted: true })).rejects.toThrow(
        /not available yet/,
      );
    });

    it('allows it once the predecessor is completed or canceled', async () => {
      for (const status of ['completed', 'canceled']) {
        const service = buildService({ statuses: { [FIRST]: status } });

        await expect(check(service, '2026-10-10')).resolves.toBeUndefined();
      }
    });

    it('blocks an occurrence after a terminated one, saying so', async () => {
      const service = buildService({ statuses: { [FIRST]: 'terminate_service' } });

      await expect(check(service, '2026-10-10')).rejects.toThrow(/terminated/);
    });

    it('still allows the current occurrence when its own day has passed (overdue)', async () => {
      // 10-09 is before today (10-10) and open: it is overdue, not hollow.
      const service = buildService({ statuses: { [FIRST]: 'confirmed' } });

      await expect(check(service, FIRST)).resolves.toBeUndefined();
    });
  });

  describe('rescheduled visits', () => {
    const MOVED = {
      [FIRST]: { status: 'rescheduled', rescheduledTo: '2026-10-20' },
      '2026-10-20': { status: 'unconfirmed', rescheduledFrom: FIRST },
    };

    it('allows the moved visit and blocks the date it moved from', async () => {
      const service = buildService({ statuses: MOVED });

      await expect(check(service, '2026-10-20')).resolves.toBeUndefined();
      await expect(check(service, FIRST, { allowCompleted: true })).rejects.toThrow(
        ValidationError,
      );
    });

    it('blocks the next series occurrence while the moved visit is open', async () => {
      const service = buildService({ statuses: MOVED });

      await expect(check(service, '2026-10-10')).rejects.toThrow(ConflictError);
    });

    it('allows the next series occurrence once the moved visit is completed', async () => {
      const service = buildService({
        statuses: { ...MOVED, '2026-10-20': { status: 'completed', rescheduledFrom: FIRST } },
      });

      await expect(check(service, '2026-10-10')).resolves.toBeUndefined();
    });
  });
});

// The real recurrence engine caps a result list at 1000 dates unless a `limit` is passed, so a
// series with more than 1000 past occurrences needs the real thing to exercise it.
describe('JobOccurrenceService on a long series (real recurrence engine)', () => {
  const LONG_SERIES_START = '2022-01-01';

  function datesBetween(start, end) {
    const dates = [];
    for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
      dates.push(new Date(time).toISOString().slice(0, 10));
    }
    return dates;
  }

  // Every day from the start through 2026-10-09 is completed (more than 1700 rows).
  function buildLongService() {
    const job = jobRow({
      date: LONG_SERIES_START,
      recurrence: { frequency: 'daily', interval: 1, endsType: 'never' },
    });
    const completed = datesBetween(LONG_SERIES_START, '2026-10-09');
    const service = buildService({
      job,
      statuses: Object.fromEntries(completed.map((date) => [date, 'completed'])),
    });
    // Same pass-through as JobService.resolveOccurrences for a rule without except-frequency.
    service.jobService.resolveOccurrences = jest.fn(async (target, { from, to, limit }) =>
      generateOccurrences(target.recurrence, target.date, { from, to, limit }),
    );
    service.jobService.getOccurrences = jest.fn(async (_id, { from, to }) =>
      generateOccurrences(job.recurrence, job.date, { from, to }),
    );
    return service;
  }

  it('returns the current window of a series with more than 1000 settled occurrences', async () => {
    const service = buildLongService();

    const items = await service.getSchedule('job-1', { from: '2026-10-10', limit: 3 });

    expect(states(items)).toEqual(['2026-10-10:real', '2026-10-11:hollow', '2026-10-12:hollow']);
  });

  it('shows an overdue occurrence deep in a long series', async () => {
    const service = buildLongService();
    service.jobOccurrenceRepository.findAllForJob.mockImplementation(async () =>
      datesBetween(LONG_SERIES_START, '2026-10-07').map((occurrenceDate) => ({
        id: `row-${occurrenceDate}`,
        occurrenceDate,
        status: 'completed',
        rescheduledTo: null,
      })),
    );

    const items = await service.getSchedule('job-1', { from: '2026-10-01', limit: 10 });

    expect(states(items.slice(-1))).toEqual(['2026-10-08:overdue']);
  });

  it('still blocks a hollow occurrence more than 1000 dates into the series', async () => {
    const service = buildLongService();

    // 2026-10-10 is open, so 2026-10-11 is hollow.
    await expect(
      service.updateStatus('job-1', '2026-10-11', { status: 'canceled' }),
    ).rejects.toThrow(ConflictError);
    expect(service.jobOccurrenceRepository.create).not.toHaveBeenCalled();
  });

  it('allows the next occurrence deep in a long series once the previous is settled', async () => {
    const service = buildLongService();

    await service.updateStatus('job-1', '2026-10-10', { status: 'completed' });

    expect(service.jobOccurrenceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ occurrenceDate: '2026-10-10', status: 'completed' }),
    );
  });

  function engineService(job) {
    const service = buildService({ job });
    service.jobService.resolveOccurrences = jest.fn(async (target, { from, to, limit }) =>
      generateOccurrences(target.recurrence, target.date, { from, to, limit }),
    );
    return service;
  }

  it('widens its date window until a sparse (yearly) series fills the limit', async () => {
    const service = engineService(
      jobRow({
        date: '2026-10-10',
        recurrence: {
          frequency: 'yearly',
          interval: 1,
          yearlyRepeatBy: 'day_of_year',
          endsType: 'never',
        },
      }),
    );

    const items = await service.getSchedule('job-1', { limit: 3 });

    expect(items.map((item) => item.date)).toEqual(['2026-10-10', '2027-10-10', '2028-10-10']);
  });

  it('validates rescheduledTo against the real series dates and end', async () => {
    // Mondays 2026-10-12, 10-19, 10-26, then the series ends.
    const weekly = {
      frequency: 'weekly',
      interval: 1,
      weeklyPeriod: 'every',
      weeklyDaysOfWeek: [1],
      endsType: 'after',
      endsAfterCount: 3,
    };
    const move = (to) =>
      engineService(jobRow({ date: '2026-10-12', recurrence: weekly })).updateStatus(
        'job-1',
        '2026-10-12',
        { status: 'rescheduled', rescheduledTo: to },
      );

    await expect(move('2026-10-19')).rejects.toThrow(ConflictError);
    await expect(move('2026-10-27')).rejects.toThrow(ValidationError);
    await expect(move('2026-10-13')).resolves.toMatchObject({ rescheduledTo: '2026-10-13' });
    await expect(move('2026-10-26')).rejects.toThrow(ConflictError);
  });

  it('stops widening once a finite series has ended', async () => {
    const service = engineService(
      jobRow({
        date: '2026-10-10',
        recurrence: { frequency: 'daily', interval: 1, endsType: 'after', endsAfterCount: 3 },
      }),
    );

    const items = await service.getSchedule('job-1', { limit: 50 });

    expect(items).toHaveLength(3);
    expect(service.jobService.resolveOccurrences).toHaveBeenCalledTimes(1);
  });
});
