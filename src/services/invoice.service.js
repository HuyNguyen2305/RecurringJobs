import { NotFoundError, ValidationError, ConflictError } from '#common/error.js';
import { sequelize } from '#common/database.js';
import { INVOICE_MAX_DAYS_AHEAD } from '#constants/validation.js';
import { addDaysUtc } from '#common/dates.js';
import { validateLineItems, toLineItemRows, summarizeLineItems } from '#common/line-items.js';
import { buildJobSnapshot } from '#common/job-snapshot.js';
import { assertValidOccurrenceDate } from '#common/occurrence-validation.js';

const INVOICE_OCCURRENCE_UNIQUE_INDEX = 'customer_documents_invoice_occurrence_unique';

export class InvoiceService {
  constructor({
    invoiceRepository,
    customerLineItemRepository,
    jobRepository,
    jobOccurrenceRepository,
    jobOccurrenceService,
    jobService,
  }) {
    this.invoiceRepository = invoiceRepository;
    this.customerLineItemRepository = customerLineItemRepository;
    this.jobRepository = jobRepository;
    this.jobOccurrenceRepository = jobOccurrenceRepository;
    this.jobOccurrenceService = jobOccurrenceService;
    this.jobService = jobService;
  }

  async generate(jobId, { occurrenceDate, lineItems, notes }) {
    validateLineItems(lineItems);

    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }

    if (job.status === 'canceled') {
      throw new ValidationError('Cannot generate an invoice for a canceled job');
    }

    if (occurrenceDate > addDaysUtc(INVOICE_MAX_DAYS_AHEAD)) {
      throw new ValidationError(
        `occurrenceDate cannot be more than ${INVOICE_MAX_DAYS_AHEAD} days in the future`,
      );
    }

    await assertValidOccurrenceDate(
      job,
      occurrenceDate,
      this.jobService,
      this.jobOccurrenceRepository,
    );

    await this.jobOccurrenceService.assertAvailableFor(job, occurrenceDate, {
      action: 'generate an invoice',
      allowCompleted: true,
    });

    const duplicateMessage = `Job ${jobId} already has an invoice for ${occurrenceDate}`;
    const existing = await this.invoiceRepository.findByJobAndDate(jobId, occurrenceDate);
    if (existing) {
      throw new ConflictError(duplicateMessage);
    }

    let invoice;
    try {
      invoice = await sequelize.transaction(async (transaction) => {
        const created = await this.invoiceRepository.create(
          {
            customerId: job.customerId,
            locationId: job.locationId,
            serviceTypeId: job.serviceTypeId,
            notes,
            jobId,
            occurrenceDate,
            jobSnapshot: buildJobSnapshot(job),
          },
          { transaction },
        );
        await this.customerLineItemRepository.bulkCreate(toLineItemRows(created.id, lineItems), {
          transaction,
        });
        return created;
      });
    } catch (error) {
      // A concurrent request can pass the duplicate check above; the unique index decides.
      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.parent?.constraint === INVOICE_OCCURRENCE_UNIQUE_INDEX
      ) {
        throw new ConflictError(duplicateMessage);
      }
      throw error;
    }

    return this.getById(invoice.id);
  }

  async getById(id) {
    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) {
      throw new NotFoundError(`Invoice ${id} not found`);
    }
    const rows = await this.customerLineItemRepository.findAllForParent(id);
    return { ...invoice.toJSON(), ...summarizeLineItems(rows) };
  }

  async listForJob(jobId) {
    const invoices = await this.invoiceRepository.findAllForJob(jobId);
    if (invoices.length === 0) {
      return [];
    }

    const rows = await this.customerLineItemRepository.findAllForParents(
      invoices.map((invoice) => invoice.id),
    );
    return invoices.map((invoice) => ({
      ...invoice.toJSON(),
      ...summarizeLineItems(rows.filter((row) => row.parentId === invoice.id)),
    }));
  }
}
