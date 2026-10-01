import { JobOccurrenceRepository } from '#repositories/job-occurrence.repository.js';
import { sequelize } from '#common/database.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import { seedDocumentRefs } from '../../helpers/seed-documents.js';
import jobOccurrenceFixture from '../../fixtures/job-occurrence.fixture.cjs';

// Runs `work` in a nested transaction (a savepoint) of the test's rolled-back transaction.
function sequelizeSavepoint(transaction, work) {
  return sequelize.transaction({ transaction }, work);
}

afterAll(async () => {
  await sequelize.close();
});

describe('JobOccurrenceRepository (integration)', () => {
  it('finds a row by job and date, and lists a job’s rows oldest first up to `to`', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new JobOccurrenceRepository();
      const { job } = await seedDocumentRefs(transaction);
      const later = await repository.create(
        jobOccurrenceFixture({ jobId: job.id, occurrenceDate: '2026-10-08' }),
        { transaction },
      );
      const earlier = await repository.create(
        jobOccurrenceFixture({ jobId: job.id, occurrenceDate: '2026-10-01' }),
        { transaction },
      );

      const found = await repository.findByJobAndDate(job.id, '2026-10-01', { transaction });
      expect(found.id).toBe(earlier.id);
      await expect(
        repository.findByJobAndDate(job.id, '2026-12-31', { transaction }),
      ).resolves.toBeNull();

      const all = await repository.findAllForJob(job.id, {}, { transaction });
      expect(all.map((row) => row.id)).toEqual([earlier.id, later.id]);
      const upTo = await repository.findAllForJob(job.id, { to: '2026-10-05' }, { transaction });
      expect(upTo.map((row) => row.id)).toEqual([earlier.id]);
    });
  });

  it('defaults a new row to unconfirmed', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const { job } = await seedDocumentRefs(transaction);
      const row = await new JobOccurrenceRepository().create(
        jobOccurrenceFixture({ jobId: job.id, occurrenceDate: '2026-10-01' }),
        { transaction },
      );

      expect(row.status).toBe('unconfirmed');
      expect(row.rescheduledTo).toBeNull();
    });
  });

  it('allows only one row per job occurrence', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new JobOccurrenceRepository();
      const { job } = await seedDocumentRefs(transaction);
      const data = jobOccurrenceFixture({ jobId: job.id, occurrenceDate: '2026-10-01' });

      await repository.create(data, { transaction });

      await expect(repository.create(data, { transaction })).rejects.toMatchObject({
        name: 'SequelizeUniqueConstraintError',
        parent: { constraint: 'job_occurrences_job_date_unique' },
      });
    });
  });

  it('requires rescheduledTo exactly when the status is rescheduled', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new JobOccurrenceRepository();
      const { job } = await seedDocumentRefs(transaction);

      await expect(
        repository.create(
          jobOccurrenceFixture(
            { jobId: job.id, occurrenceDate: '2026-10-01' },
            { status: 'rescheduled' },
          ),
          { transaction, logging: false },
        ),
      ).rejects.toMatchObject({ parent: { constraint: 'job_occurrences_rescheduled_to_check' } });
    });

    await seedWithTransaction(async ({ transaction }) => {
      const repository = new JobOccurrenceRepository();
      const { job } = await seedDocumentRefs(transaction);

      await expect(
        repository.create(
          jobOccurrenceFixture(
            { jobId: job.id, occurrenceDate: '2026-10-01' },
            { status: 'confirmed', rescheduledTo: '2026-10-08' },
          ),
          { transaction },
        ),
      ).rejects.toMatchObject({ parent: { constraint: 'job_occurrences_rescheduled_to_check' } });
    });
  });

  it('stores rescheduledFrom and only accepts it for a date after the original', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new JobOccurrenceRepository();
      const { job } = await seedDocumentRefs(transaction);

      const moved = await repository.create(
        jobOccurrenceFixture(
          { jobId: job.id, occurrenceDate: '2026-10-08' },
          { rescheduledFrom: '2026-10-01' },
        ),
        { transaction },
      );

      expect(moved.rescheduledFrom).toBe('2026-10-01');
      const found = await repository.findByJobAndDate(job.id, '2026-10-08', { transaction });
      expect(found.rescheduledFrom).toBe('2026-10-01');
      expect(found.status).toBe('unconfirmed');
    });

    for (const rescheduledFrom of ['2026-10-08', '2026-10-09']) {
      await seedWithTransaction(async ({ transaction }) => {
        const { job } = await seedDocumentRefs(transaction);

        await expect(
          new JobOccurrenceRepository().create(
            jobOccurrenceFixture(
              { jobId: job.id, occurrenceDate: '2026-10-08' },
              { rescheduledFrom },
            ),
            { transaction },
          ),
        ).rejects.toMatchObject({
          parent: { constraint: 'job_occurrences_rescheduled_from_check' },
        });
      });
    }
  });

  it('writes an original and its moved visit together, and rolls both back on a unique clash', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new JobOccurrenceRepository();
      const { job } = await seedDocumentRefs(transaction);
      await repository.create(
        jobOccurrenceFixture({ jobId: job.id, occurrenceDate: '2026-10-08' }),
        { transaction },
      );

      // Same shape as the service's reschedule: original row, then the visit at the target date.
      const attempt = sequelizeSavepoint(transaction, async (inner) => {
        await repository.create(
          jobOccurrenceFixture(
            { jobId: job.id, occurrenceDate: '2026-10-01' },
            { status: 'rescheduled', rescheduledTo: '2026-10-08' },
          ),
          { transaction: inner },
        );
        await repository.create(
          jobOccurrenceFixture(
            { jobId: job.id, occurrenceDate: '2026-10-08' },
            { rescheduledFrom: '2026-10-01' },
          ),
          { transaction: inner },
        );
      });

      await expect(attempt).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
      // The first insert was rolled back with the failed one.
      await expect(
        repository.findByJobAndDate(job.id, '2026-10-01', { transaction }),
      ).resolves.toBeNull();
    });
  });

  it('requires completedAt exactly when the status is completed', async () => {
    const rejected = [
      { status: 'completed' },
      { status: 'confirmed', completedAt: new Date('2026-10-01T10:00:00Z') },
    ];
    for (const overrides of rejected) {
      await seedWithTransaction(async ({ transaction }) => {
        const { job } = await seedDocumentRefs(transaction);

        await expect(
          new JobOccurrenceRepository().create(
            jobOccurrenceFixture({ jobId: job.id, occurrenceDate: '2026-10-01' }, overrides),
            { transaction },
          ),
        ).rejects.toMatchObject({ parent: { constraint: 'job_occurrences_completed_at_check' } });
      });
    }

    await seedWithTransaction(async ({ transaction }) => {
      const { job } = await seedDocumentRefs(transaction);
      const completedAt = new Date('2026-10-01T10:00:00Z');

      const row = await new JobOccurrenceRepository().create(
        jobOccurrenceFixture(
          { jobId: job.id, occurrenceDate: '2026-10-01' },
          { status: 'completed', completedAt },
        ),
        { transaction },
      );

      expect(row.completedAt).toEqual(completedAt);
    });
  });

  it('moves status only via a CAS transition, refusing a stale "from"', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new JobOccurrenceRepository();
      const { job } = await seedDocumentRefs(transaction);
      const row = await repository.create(
        jobOccurrenceFixture({ jobId: job.id, occurrenceDate: '2026-10-01' }),
        { transaction },
      );

      const changed = await repository.transitionStatus(
        row.id,
        ['unconfirmed', 'confirmed'],
        { status: 'completed', completedAt: new Date() },
        { transaction },
      );
      expect(changed).toBe(1);

      // Now 'completed' - a CAS from the open statuses must not apply.
      const stale = await repository.transitionStatus(
        row.id,
        ['unconfirmed', 'confirmed'],
        { status: 'canceled' },
        { transaction },
      );
      expect(stale).toBe(0);

      const found = await repository.findByJobAndDate(job.id, '2026-10-01', { transaction });
      expect(found.status).toBe('completed');
    });
  });

  it('rejects a row whose job does not exist', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      await expect(
        new JobOccurrenceRepository().create(
          jobOccurrenceFixture({
            jobId: '00000000-0000-0000-0000-000000000000',
            occurrenceDate: '2026-10-01',
          }),
          { transaction },
        ),
      ).rejects.toMatchObject({ name: 'SequelizeForeignKeyConstraintError' });
    });
  });
});
