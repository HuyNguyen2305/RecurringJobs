import { CustomerDocumentRepository } from '#repositories/customer-document.repository.js';

export class InvoiceRepository extends CustomerDocumentRepository {
  constructor() {
    super('invoice');
  }

  async findByJobAndDate(jobId, occurrenceDate, options = {}) {
    return this.scoped().findOne({ where: this.withType({ jobId, occurrenceDate }), ...options });
  }

  async findAllForJob(jobId, options = {}) {
    return this.scoped().findAll({
      where: this.withType({ jobId }),
      order: [['occurrenceDate', 'DESC']],
      ...options,
    });
  }
}
