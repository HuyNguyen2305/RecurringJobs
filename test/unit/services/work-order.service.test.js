import { jest } from '@jest/globals';

const TRANSACTION = { id: 'tx-1' };

const fakeSequelize = {
  transaction: jest.fn(async (callback) => callback(TRANSACTION)),
};

jest.unstable_mockModule('#common/database.js', () => ({
  sequelize: fakeSequelize,
}));

const { WorkOrderService } = await import('#service/work-order.service.js');
const { NotFoundError, ValidationError, ConflictError } = await import('#common/error.js');

function jobRow(overrides = {}) {
  return {
    id: 'job-1',
    date: '2026-10-01',
    status: 'unconfirmed',
    recurrence: null,
    ...overrides,
  };
}

function workOrderRow(overrides = {}) {
  const row = {
    id: 'wo-1',
    jobId: 'job-1',
    occurrenceDate: '2026-10-01',
    status: 'dispatched',
    notes: null,
    completedAt: null,
    ...overrides,
  };
  return { ...row, toJSON: () => row };
}

function buildService(overrides = {}) {
  const service = Object.create(WorkOrderService.prototype);
  Object.assign(service, {
    workOrderRepository: {
      create: jest.fn(async (data) => ({ id: 'wo-1', ...data })),
      findByJobAndDate: jest.fn(async () => null),
      findById: jest.fn(async () => workOrderRow()),
      findAllForJob: jest.fn(async () => []),
      transitionStatus: jest.fn(async () => 1),
    },
    workOrderTaskRepository: {
      bulkCreate: jest.fn(async () => []),
      findAllForParent: jest.fn(async () => []),
      findAllForParents: jest.fn(async () => []),
      setDone: jest.fn(async () => 1),
    },
    jobRepository: {
      findById: jest.fn(async () => jobRow()),
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

describe('WorkOrderService#create', () => {
  it('throws NotFoundError when the job does not exist', async () => {
    const service = buildService({
      jobRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.create('missing-job', { occurrenceDate: '2026-10-01' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws ValidationError for a canceled job and creates nothing', async () => {
    const service = buildService({
      jobRepository: { findById: jest.fn(async () => jobRow({ status: 'canceled' })) },
    });

    await expect(service.create('job-1', { occurrenceDate: '2026-10-01' })).rejects.toThrow(
      ValidationError,
    );
    expect(service.workOrderRepository.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError when occurrenceDate does not match a non-recurring job date', async () => {
    const service = buildService();

    await expect(service.create('job-1', { occurrenceDate: '2026-10-02' })).rejects.toThrow(
      ValidationError,
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

    await service.create('job-1', { occurrenceDate: '2026-10-08' });

    expect(service.jobService.getOccurrences).toHaveBeenCalledWith('job-1', {
      from: '2026-10-08',
      to: '2026-10-08',
    });
    expect(service.workOrderRepository.create).toHaveBeenCalled();
  });

  it('creates the work order and its tasks in one transaction', async () => {
    const service = buildService();

    await service.create('job-1', {
      occurrenceDate: '2026-10-01',
      notes: 'Gate code 1234',
      tasks: [{ description: 'Mow front lawn' }, { description: 'Trim hedges' }],
    });

    expect(fakeSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(service.workOrderRepository.create).toHaveBeenCalledWith(
      { jobId: 'job-1', occurrenceDate: '2026-10-01', notes: 'Gate code 1234' },
      { transaction: TRANSACTION },
    );
    expect(service.workOrderTaskRepository.bulkCreate).toHaveBeenCalledWith(
      [
        { parentId: 'wo-1', description: 'Mow front lawn', position: 0 },
        { parentId: 'wo-1', description: 'Trim hedges', position: 1 },
      ],
      { transaction: TRANSACTION },
    );
  });

  it('creates a work order with no tasks (notes-only)', async () => {
    const service = buildService();

    await service.create('job-1', { occurrenceDate: '2026-10-01' });

    expect(service.workOrderTaskRepository.bulkCreate).not.toHaveBeenCalled();
  });

  it('throws ConflictError when the occurrence already has a work order', async () => {
    const service = buildService();
    service.workOrderRepository.findByJobAndDate = jest.fn(async () => ({ id: 'existing' }));

    await expect(service.create('job-1', { occurrenceDate: '2026-10-01' })).rejects.toThrow(
      ConflictError,
    );
    expect(service.workOrderRepository.create).not.toHaveBeenCalled();
  });

  it('maps a lost race on the one-work-order-per-occurrence index to ConflictError', async () => {
    const uniqueError = Object.assign(new Error('duplicate'), {
      name: 'SequelizeUniqueConstraintError',
      parent: { constraint: 'work_orders_job_occurrence_unique' },
    });
    const service = buildService();
    service.workOrderRepository.create = jest.fn(async () => Promise.reject(uniqueError));

    await expect(service.create('job-1', { occurrenceDate: '2026-10-01' })).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('WorkOrderService#updateStatus', () => {
  it.each([
    ['dispatched', 'in_progress'],
    ['in_progress', 'completed'],
    ['dispatched', 'canceled'],
    ['in_progress', 'canceled'],
  ])('allows %s -> %s', async (from, to) => {
    const service = buildService({
      workOrderRepository: {
        findById: jest.fn(async () => workOrderRow({ status: from })),
        transitionStatus: jest.fn(async () => 1),
      },
    });

    await service.updateStatus('wo-1', to);

    const expectedFields =
      to === 'completed' ? { status: 'completed', completedAt: expect.any(Date) } : { status: to };
    expect(service.workOrderRepository.transitionStatus).toHaveBeenCalledWith(
      'wo-1',
      expect.arrayContaining([from]),
      expectedFields,
    );
  });

  it('rejects dispatched -> completed (must pass through in_progress)', async () => {
    const service = buildService({
      workOrderRepository: {
        findById: jest.fn(async () => workOrderRow({ status: 'dispatched' })),
      },
    });

    await expect(service.updateStatus('wo-1', 'completed')).rejects.toThrow(ConflictError);
  });

  it('rejects transitions out of a terminal status', async () => {
    const service = buildService({
      workOrderRepository: { findById: jest.fn(async () => workOrderRow({ status: 'completed' })) },
    });

    await expect(service.updateStatus('wo-1', 'canceled')).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when a concurrent change wins the CAS race', async () => {
    const service = buildService({
      workOrderRepository: {
        findById: jest.fn(async () => workOrderRow({ status: 'dispatched' })),
        transitionStatus: jest.fn(async () => 0),
      },
    });

    await expect(service.updateStatus('wo-1', 'in_progress')).rejects.toThrow(ConflictError);
  });

  it('throws NotFoundError for an unknown id', async () => {
    const service = buildService({
      workOrderRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.updateStatus('missing', 'in_progress')).rejects.toThrow(NotFoundError);
  });
});

describe('WorkOrderService#updateTask', () => {
  it('toggles a task and returns the refreshed work order', async () => {
    const service = buildService({
      workOrderRepository: {
        findById: jest.fn(async () => workOrderRow({ status: 'in_progress' })),
      },
    });

    await service.updateTask('wo-1', 'task-1', true);

    expect(service.workOrderTaskRepository.setDone).toHaveBeenCalledWith('task-1', 'wo-1', true);
  });

  it.each(['completed', 'canceled'])(
    'blocks toggling a task on a %s work order',
    async (status) => {
      const service = buildService({
        workOrderRepository: { findById: jest.fn(async () => workOrderRow({ status })) },
      });

      await expect(service.updateTask('wo-1', 'task-1', true)).rejects.toThrow(ConflictError);
      expect(service.workOrderTaskRepository.setDone).not.toHaveBeenCalled();
    },
  );

  it('throws NotFoundError when the task does not belong to the work order', async () => {
    const service = buildService({
      workOrderRepository: {
        findById: jest.fn(async () => workOrderRow({ status: 'dispatched' })),
      },
      workOrderTaskRepository: { setDone: jest.fn(async () => 0) },
    });

    await expect(service.updateTask('wo-1', 'missing-task', true)).rejects.toThrow(NotFoundError);
  });
});

describe('WorkOrderService#getById', () => {
  it('throws NotFoundError when the work order does not exist', async () => {
    const service = buildService({
      workOrderRepository: { findById: jest.fn(async () => null) },
    });

    await expect(service.getById('missing-id')).rejects.toThrow(NotFoundError);
  });

  it('returns the work order with its tasks summarized', async () => {
    const service = buildService();
    service.workOrderTaskRepository.findAllForParent = jest.fn(async () => [
      { id: 'task-1', description: 'Mow', isDone: false, position: 0 },
      { id: 'task-2', description: 'Trim', isDone: true, position: 1 },
    ]);

    const workOrder = await service.getById('wo-1');

    expect(service.workOrderTaskRepository.findAllForParent).toHaveBeenCalledWith('wo-1');
    expect(workOrder.tasks).toEqual([
      { id: 'task-1', description: 'Mow', isDone: false, position: 0 },
      { id: 'task-2', description: 'Trim', isDone: true, position: 1 },
    ]);
  });
});

describe('WorkOrderService#listForJob', () => {
  it('returns an empty list without querying tasks when the job has no work orders', async () => {
    const service = buildService();

    await expect(service.listForJob('job-1')).resolves.toEqual([]);
    expect(service.workOrderTaskRepository.findAllForParents).not.toHaveBeenCalled();
  });

  it('loads every work order’s tasks in one query, grouped by work order', async () => {
    const service = buildService();
    service.workOrderRepository.findAllForJob = jest.fn(async () => [
      workOrderRow({ id: 'wo-2', occurrenceDate: '2026-10-08' }),
      workOrderRow({ id: 'wo-1', occurrenceDate: '2026-10-01' }),
    ]);
    service.workOrderTaskRepository.findAllForParents = jest.fn(async () => [
      { id: 'a', parentId: 'wo-1', description: 'a', isDone: false, position: 0 },
      { id: 'b', parentId: 'wo-2', description: 'b', isDone: true, position: 0 },
    ]);

    const workOrders = await service.listForJob('job-1');

    expect(service.workOrderTaskRepository.findAllForParents).toHaveBeenCalledTimes(1);
    expect(service.workOrderTaskRepository.findAllForParents).toHaveBeenCalledWith([
      'wo-2',
      'wo-1',
    ]);
    expect(workOrders.map((wo) => [wo.id, wo.tasks.length])).toEqual([
      ['wo-2', 1],
      ['wo-1', 1],
    ]);
  });
});
