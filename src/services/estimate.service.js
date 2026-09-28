import { NotFoundError, ValidationError, ConflictError } from '#common/error.js';
import { sequelize } from '#common/database.js';
import { validateLineItems, toLineItemRows, summarizeLineItems } from '#common/line-items.js';
import { buildJobSnapshot } from '#common/job-snapshot.js';

// Allowed status transitions: the target status -> the status it must come from.
const TRANSITIONS = {
  sent: 'draft',
  approved: 'sent',
  declined: 'sent',
};

export class EstimateService {
  constructor({
    estimateRepository,
    customerLineItemRepository,
    customerRepository,
    locationRepository,
    serviceTypeRepository,
    jobService,
  }) {
    this.estimateRepository = estimateRepository;
    this.customerLineItemRepository = customerLineItemRepository;
    this.customerRepository = customerRepository;
    this.locationRepository = locationRepository;
    this.serviceTypeRepository = serviceTypeRepository;
    this.jobService = jobService;
  }

  async assertExists(repository, id, label) {
    const record = await repository.findById(id);
    if (!record) {
      throw new NotFoundError(`${label} ${id} not found`);
    }
    return record;
  }

  async create(data) {
    const { lineItems, ...estimateData } = data;

    validateLineItems(lineItems);

    await this.assertExists(this.customerRepository, estimateData.customerId, 'Customer');
    const location = await this.assertExists(
      this.locationRepository,
      estimateData.locationId,
      'Location',
    );
    await this.assertExists(this.serviceTypeRepository, estimateData.serviceTypeId, 'Service type');

    if (location.customerId !== estimateData.customerId) {
      throw new ValidationError('Location does not belong to the given customer');
    }

    const estimate = await sequelize.transaction(async (transaction) => {
      const created = await this.estimateRepository.create(estimateData, { transaction });
      await this.customerLineItemRepository.bulkCreate(toLineItemRows(created.id, lineItems), {
        transaction,
      });
      return created;
    });

    return this.getById(estimate.id);
  }

  async getById(id) {
    const estimate = await this.assertExists(this.estimateRepository, id, 'Estimate');
    const rows = await this.customerLineItemRepository.findAllForParent(id);
    return { ...estimate.toJSON(), ...summarizeLineItems(rows) };
  }

  async updateStatus(id, status) {
    const estimate = await this.assertExists(this.estimateRepository, id, 'Estimate');

    const requiredFrom = TRANSITIONS[status];
    if (estimate.status !== requiredFrom) {
      throw new ConflictError(`Cannot change estimate status from ${estimate.status} to ${status}`);
    }

    const changed = await this.estimateRepository.transitionStatus(id, requiredFrom, status);
    if (changed === 0) {
      throw new ConflictError(`Estimate ${id} was changed by another request; reload and retry`);
    }

    return this.getById(id);
  }

  /**
   * Creates the job and links it back to the estimate in one transaction. The estimate row
   * is locked first, so concurrent converts run one at a time and only the first succeeds;
   * any failure rolls the new job back too.
   */
  async convertToJob(id, jobData) {
    return sequelize.transaction(async (transaction) => {
      const estimate = await this.estimateRepository.findByIdForUpdate(id, { transaction });
      if (!estimate) {
        throw new NotFoundError(`Estimate ${id} not found`);
      }
      if (estimate.status !== 'approved') {
        throw new ConflictError(
          `Only an approved estimate can be converted (status: ${estimate.status})`,
        );
      }
      if (estimate.jobId) {
        throw new ConflictError(`Estimate ${id} was already converted to job ${estimate.jobId}`);
      }

      const job = await this.jobService.create(
        {
          ...jobData,
          customerId: estimate.customerId,
          locationId: estimate.locationId,
          serviceTypeId: estimate.serviceTypeId,
        },
        { transaction },
      );

      await this.estimateRepository.linkJob(id, job.id, buildJobSnapshot(job), { transaction });

      return job;
    });
  }
}
