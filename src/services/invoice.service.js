import { NotFoundError, ValidationError, ConflictError } from '#common/error.js';
import { INVOICE_MAX_DAYS_AHEAD } from '#constants/validation.js';

const MS_PER_DAY = 86400000;

// Today (UTC) plus `days`, as YYYY-MM-DD - the same UTC date convention as the recurrence engine.
function addDaysUtc(days) {
  return new Date(Date.now() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

// Float-safe: 1.1 * 100 is 110.00000000000001, which must still count as 2 decimals.
function hasAtMostTwoDecimals(amount) {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

export class InvoiceService {
  constructor({ invoiceRepository, jobRepository, jobService }) {
    this.invoiceRepository = invoiceRepository;
    this.jobRepository = jobRepository;
    this.jobService = jobService;
  }

  async assertValidOccurrenceDate(job, occurrenceDate) {
    if (!job.recurrence) {
      if (occurrenceDate !== job.date) {
        throw new ValidationError(
          `occurrenceDate must equal the job date (${job.date}) for a non-recurring job`,
        );
      }
      return;
    }

    const matches = await this.jobService.getOccurrences(job.id, {
      from: occurrenceDate,
      to: occurrenceDate,
    });
    if (!matches.includes(occurrenceDate)) {
      throw new ValidationError(`${occurrenceDate} is not a valid occurrence of this job`);
    }
  }

  buildJobSnapshot(job) {
    return {
      customerId: job.customerId,
      customerName: job.customer?.name,
      locationId: job.locationId,
      locationAddress: job.location?.addressLine1,
      serviceTypeId: job.serviceTypeId,
      serviceTypeName: job.serviceType?.name,
      date: job.date,
      startTime: job.startTime,
      lengthMinutes: job.lengthMinutes,
    };
  }

  async generate(jobId, { occurrenceDate, amount }) {
    if (!hasAtMostTwoDecimals(amount)) {
      throw new ValidationError('amount cannot have more than 2 decimal places');
    }

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

    await this.assertValidOccurrenceDate(job, occurrenceDate);

    const existing = await this.invoiceRepository.findByJobAndDate(jobId, occurrenceDate);
    if (existing) {
      throw new ConflictError(`Job ${jobId} already has an invoice for ${occurrenceDate}`);
    }

    return this.invoiceRepository.create({
      jobId,
      occurrenceDate,
      amount,
      jobSnapshot: this.buildJobSnapshot(job),
    });
  }

  async getById(id) {
    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) {
      throw new NotFoundError(`Invoice ${id} not found`);
    }
    return invoice;
  }

  async listForJob(jobId) {
    return this.invoiceRepository.findAllForJob(jobId);
  }
}
