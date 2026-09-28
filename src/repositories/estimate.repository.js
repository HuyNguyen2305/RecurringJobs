import { CustomerDocumentRepository } from '#repositories/customer-document.repository.js';
import { Customer } from '#models/customer.model.js';
import { Location } from '#models/location.model.js';
import { ServiceType } from '#models/service-type.model.js';
import { Job } from '#models/job.model.js';

const DEFAULT_INCLUDE = [
  { model: Customer, as: 'customer' },
  { model: Location, as: 'location' },
  { model: ServiceType, as: 'serviceType' },
  { model: Job, as: 'job', attributes: ['id', 'date', 'status'] },
];

export class EstimateRepository extends CustomerDocumentRepository {
  constructor() {
    super('estimate');
  }

  async findById(id, options = {}) {
    return super.findById(id, { include: DEFAULT_INCLUDE, ...options });
  }

  // Locks the estimate row until the transaction ends, so concurrent converts run one at a time.
  async findByIdForUpdate(id, { transaction }) {
    return super.findById(id, { transaction, lock: transaction.LOCK.UPDATE });
  }

  /**
   * Atomic compare-and-set: moves the estimate from `from` to `to` only if it is still
   * in `from`. Returns the number of rows changed, so 0 means a concurrent change won.
   */
  async transitionStatus(id, from, to, options = {}) {
    const [count] = await this.scoped().update(
      { status: to },
      { where: this.withType({ id, status: from }), ...options },
    );
    return count;
  }

  async linkJob(id, jobId, jobSnapshot, options = {}) {
    const [count] = await this.scoped().update(
      { jobId, jobSnapshot },
      { where: this.withType({ id }), ...options },
    );
    return count;
  }
}
