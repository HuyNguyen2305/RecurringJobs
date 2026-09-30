import { NotFoundError, ValidationError, ConflictError } from '#common/error.js';
import { sequelize } from '#common/database.js';
import { assertValidOccurrenceDate } from '#common/occurrence-validation.js';

const WORK_ORDER_OCCURRENCE_UNIQUE_INDEX = 'work_orders_job_occurrence_unique';

// Target status -> the statuses it may come from. Nothing transitions back to 'dispatched'.
const ALLOWED_FROM = {
  in_progress: ['dispatched'],
  completed: ['in_progress'],
  canceled: ['dispatched', 'in_progress'],
};

function toTaskRows(parentId, tasks) {
  return tasks.map((task, position) => ({ parentId, description: task.description, position }));
}

function summarizeTasks(rows) {
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    isDone: row.isDone,
    position: row.position,
  }));
}

export class WorkOrderService {
  constructor({ workOrderRepository, workOrderTaskRepository, jobRepository, jobService }) {
    this.workOrderRepository = workOrderRepository;
    this.workOrderTaskRepository = workOrderTaskRepository;
    this.jobRepository = jobRepository;
    this.jobService = jobService;
  }

  async create(jobId, { occurrenceDate, notes, tasks = [] }) {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }

    if (job.status === 'canceled') {
      throw new ValidationError('Cannot create a work order for a canceled job');
    }

    await assertValidOccurrenceDate(job, occurrenceDate, this.jobService);

    const duplicateMessage = `Job ${jobId} already has a work order for ${occurrenceDate}`;
    const existing = await this.workOrderRepository.findByJobAndDate(jobId, occurrenceDate);
    if (existing) {
      throw new ConflictError(duplicateMessage);
    }

    let workOrder;
    try {
      workOrder = await sequelize.transaction(async (transaction) => {
        const created = await this.workOrderRepository.create(
          { jobId, occurrenceDate, notes },
          { transaction },
        );
        if (tasks.length > 0) {
          await this.workOrderTaskRepository.bulkCreate(toTaskRows(created.id, tasks), {
            transaction,
          });
        }
        return created;
      });
    } catch (error) {
      // A concurrent request can pass the duplicate check above; the unique index decides.
      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.parent?.constraint === WORK_ORDER_OCCURRENCE_UNIQUE_INDEX
      ) {
        throw new ConflictError(duplicateMessage);
      }
      throw error;
    }

    return this.getById(workOrder.id);
  }

  async updateStatus(id, status) {
    const workOrder = await this.assertExists(id);

    const fromStatuses = ALLOWED_FROM[status];
    if (!fromStatuses.includes(workOrder.status)) {
      throw new ConflictError(
        `Cannot change work order status from ${workOrder.status} to ${status}`,
      );
    }

    const fields = { status, ...(status === 'completed' ? { completedAt: new Date() } : {}) };
    const changed = await this.workOrderRepository.transitionStatus(id, fromStatuses, fields);
    if (changed === 0) {
      throw new ConflictError(`Work order ${id} was changed by another request; reload and retry`);
    }

    return this.getById(id);
  }

  async updateTask(workOrderId, taskId, isDone) {
    const workOrder = await this.assertExists(workOrderId);

    if (workOrder.status === 'completed' || workOrder.status === 'canceled') {
      throw new ConflictError(`Cannot change tasks on a ${workOrder.status} work order`);
    }

    const changed = await this.workOrderTaskRepository.setDone(taskId, workOrderId, isDone);
    if (changed === 0) {
      throw new NotFoundError(`Task ${taskId} not found on work order ${workOrderId}`);
    }

    return this.getById(workOrderId);
  }

  async assertExists(id) {
    const workOrder = await this.workOrderRepository.findById(id);
    if (!workOrder) {
      throw new NotFoundError(`Work order ${id} not found`);
    }
    return workOrder;
  }

  async getById(id) {
    const workOrder = await this.assertExists(id);
    const rows = await this.workOrderTaskRepository.findAllForParent(id);
    return { ...workOrder.toJSON(), tasks: summarizeTasks(rows) };
  }

  async listForJob(jobId) {
    const workOrders = await this.workOrderRepository.findAllForJob(jobId);
    if (workOrders.length === 0) {
      return [];
    }

    const rows = await this.workOrderTaskRepository.findAllForParents(
      workOrders.map((workOrder) => workOrder.id),
    );
    return workOrders.map((workOrder) => ({
      ...workOrder.toJSON(),
      tasks: summarizeTasks(rows.filter((row) => row.parentId === workOrder.id)),
    }));
  }
}
