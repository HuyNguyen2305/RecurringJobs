import { NotFoundError, ValidationError, ConflictError } from '#common/error.js';

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
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
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
