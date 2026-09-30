import { Op } from 'sequelize';
import { Baserepository } from '#common/base-repository.js';
import { WorkOrder } from '#models/work-order.model.js';
import { Job } from '#models/job.model.js';
import { WorkOrderTask } from '#models/work-order-task.model.js';

const DEFAULT_INCLUDE = [
  { model: Job, as: 'job', attributes: ['id', 'date', 'status'] },
  { model: WorkOrderTask, as: 'tasks' },
];

export class WorkOrderRepository extends Baserepository {
  constructor() {
    super(WorkOrder);
  }

  async findById(id, options = {}) {
    return this.scoped().findOne({ where: { id }, include: DEFAULT_INCLUDE, ...options });
  }

  async findByJobAndDate(jobId, occurrenceDate, options = {}) {
    return this.scoped().findOne({ where: { jobId, occurrenceDate }, ...options });
  }

  async findAllForJob(jobId, options = {}) {
    return this.scoped().findAll({
      where: { jobId },
      order: [['occurrenceDate', 'DESC']],
      ...options,
    });
  }

  /**
   * Atomic compare-and-set: moves the work order to `fields.status` only if it is currently
   * in one of `fromStatuses`. Returns the number of rows changed, so 0 means a concurrent
   * change won (or the current status wasn't one of `fromStatuses`).
   */
  async transitionStatus(id, fromStatuses, fields, options = {}) {
    const [count] = await this.scoped().update(fields, {
      where: { id, status: { [Op.in]: fromStatuses } },
      ...options,
    });
    return count;
  }
}
