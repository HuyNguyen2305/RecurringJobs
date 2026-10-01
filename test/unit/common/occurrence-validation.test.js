import { jest } from '@jest/globals';
import { assertValidOccurrenceDate } from '#common/occurrence-validation.js';
import { ValidationError } from '#common/error.js';

function jobService(occurrences) {
  return { getOccurrences: jest.fn(async () => occurrences) };
}

describe('assertValidOccurrenceDate', () => {
  it('accepts a non-recurring job whose date matches exactly', async () => {
    const job = { id: 'job-1', date: '2026-10-01', recurrence: null };

    await expect(
      assertValidOccurrenceDate(job, '2026-10-01', jobService([])),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-recurring job whose date does not match', async () => {
    const job = { id: 'job-1', date: '2026-10-01', recurrence: null };

    await expect(assertValidOccurrenceDate(job, '2026-10-02', jobService([]))).rejects.toThrow(
      ValidationError,
    );
  });

  it('accepts a recurring job when the date is a real occurrence', async () => {
    const job = { id: 'job-1', date: '2026-10-01', recurrence: { frequency: 'daily' } };
    const service = jobService(['2026-10-08']);

    await expect(assertValidOccurrenceDate(job, '2026-10-08', service)).resolves.toBeUndefined();
    expect(service.getOccurrences).toHaveBeenCalledWith('job-1', {
      from: '2026-10-08',
      to: '2026-10-08',
    });
  });

  it('rejects a recurring job when the date is not a real occurrence', async () => {
    const job = { id: 'job-1', date: '2026-10-01', recurrence: { frequency: 'daily' } };

    await expect(assertValidOccurrenceDate(job, '2026-10-08', jobService([]))).rejects.toThrow(
      ValidationError,
    );
  });

  describe('with a job occurrence repository (rescheduled visits)', () => {
    const job = { id: 'job-1', date: '2026-10-01', recurrence: { frequency: 'weekly' } };
    const repository = (row) => ({ findByJobAndDate: jest.fn(async () => row) });

    it('accepts a date that is a rescheduled visit even though the series does not generate it', async () => {
      const occurrences = jobService([]);
      const rows = repository({ occurrenceDate: '2026-10-10', rescheduledFrom: '2026-10-08' });

      await expect(
        assertValidOccurrenceDate(job, '2026-10-10', occurrences, rows),
      ).resolves.toBeUndefined();
      expect(rows.findByJobAndDate).toHaveBeenCalledWith('job-1', '2026-10-10');
    });

    it('accepts a rescheduled visit for a non-recurring job too', async () => {
      const oneOff = { id: 'job-1', date: '2026-10-01', recurrence: null };
      const rows = repository({ occurrenceDate: '2026-10-10', rescheduledFrom: '2026-10-01' });

      await expect(
        assertValidOccurrenceDate(oneOff, '2026-10-10', jobService([]), rows),
      ).resolves.toBeUndefined();
    });

    it('still rejects a date with no row or a row that is not a rescheduled visit', async () => {
      for (const row of [null, { occurrenceDate: '2026-10-10', rescheduledFrom: null }]) {
        await expect(
          assertValidOccurrenceDate(job, '2026-10-10', jobService([]), repository(row)),
        ).rejects.toThrow(ValidationError);
      }
    });

    it('falls back to the series rules for a normal occurrence', async () => {
      await expect(
        assertValidOccurrenceDate(job, '2026-10-08', jobService(['2026-10-08']), repository(null)),
      ).resolves.toBeUndefined();
    });
  });
});
