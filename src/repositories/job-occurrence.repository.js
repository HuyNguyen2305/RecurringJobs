import { Op } from 'sequelize';
import { Baserepository } from '#common/base-repository.js';
import { JobOccurrence } from '#models/job-occurrence.model.js';

export class JobOccurrenceRepository extends Baserepository {
  constructor() {
    super(JobOccurrence);
  }

  async findByJobAndDate(jobId, occurrenceDate, options = {}) {
    return this.scoped().findOne({ where: { jobId, occurrenceDate }, ...options });
  }

  // Rows for a job up to `to` (all of them when omitted), oldest first.
  async findAllForJob(jobId, { to } = {}, options = {}) {
    return this.scoped().findAll({
      where: { jobId, ...(to ? { occurrenceDate: { [Op.lte]: to } } : {}) },
      order: [['occurrenceDate', 'ASC']],
      ...options,
    });
  }

  /**
   * Atomic compare-and-set: updates the row only while its status is still one of
   * `fromStatuses`. Returns the number of rows changed, so 0 means a concurrent change won.
   */
  async transitionStatus(id, fromStatuses, fields, options = {}) {
    const [count] = await this.scoped().update(fields, {
      where: { id, status: { [Op.in]: fromStatuses } },
      ...options,
    });
    return count;
  }
}
