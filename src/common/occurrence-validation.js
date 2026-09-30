import { ValidationError } from '#common/error.js';

// Shared by invoices and work orders: both attach to one occurrence of a job.
export async function assertValidOccurrenceDate(job, occurrenceDate, jobService) {
  if (!job.recurrence) {
    if (occurrenceDate !== job.date) {
      throw new ValidationError(
        `occurrenceDate must equal the job date (${job.date}) for a non-recurring job`,
      );
    }
    return;
  }

  const matches = await jobService.getOccurrences(job.id, {
    from: occurrenceDate,
    to: occurrenceDate,
  });
  if (!matches.includes(occurrenceDate)) {
    throw new ValidationError(`${occurrenceDate} is not a valid occurrence of this job`);
  }
}
