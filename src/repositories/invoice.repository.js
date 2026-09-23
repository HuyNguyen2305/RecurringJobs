import { Baserepository } from '#common/base-repository.js';
import { Invoice } from '#models/invoice.model.js';

export class InvoiceRepository extends Baserepository {
  constructor() {
    super(Invoice);
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
}
