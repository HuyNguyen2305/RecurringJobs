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
});
