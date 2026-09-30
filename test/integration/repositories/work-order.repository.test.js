import { WorkOrderRepository } from '#repositories/work-order.repository.js';
import { JobRepository } from '#repositories/job.repository.js';
import { sequelize } from '#common/database.js';
import { generateOccurrences } from '#common/recurrence-engine.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import { seedDocumentRefs } from '../../helpers/seed-documents.js';
import jobFixture from '../../fixtures/job.fixture.cjs';
import recurrenceRuleFixture from '../../fixtures/recurrence-rule.fixture.cjs';
import workOrderFixture from '../../fixtures/work-order.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

describe('WorkOrderRepository (integration)', () => {
  it('finds work orders by job and date, and lists a job’s work orders newest first', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const workOrderRepository = new WorkOrderRepository();
      const { refs } = await seedDocumentRefs(transaction);
      const job = await new JobRepository().create(
        jobFixture(refs, {
          date: '2026-10-01',
          recurrence: recurrenceRuleFixture({ weeklyDaysOfWeek: [4] }), // weekly Thursday
        }),
        { transaction },
      );
      const [first, second] = generateOccurrences(job.recurrence, job.date, { limit: 2 });

      const older = await workOrderRepository.create(
        workOrderFixture({ jobId: job.id, occurrenceDate: first }),
        { transaction },
      );
      const newer = await workOrderRepository.create(
        workOrderFixture({ jobId: job.id, occurrenceDate: second }),
        { transaction },
      );

      const found = await workOrderRepository.findByJobAndDate(job.id, first, { transaction });
      expect(found.id).toBe(older.id);
      await expect(
        workOrderRepository.findByJobAndDate(job.id, '2026-12-31', { transaction }),
      ).resolves.toBeNull();

      const list = await workOrderRepository.findAllForJob(job.id, { transaction });
      expect(list.map((workOrder) => workOrder.id)).toEqual([newer.id, older.id]);
    });
  });

  it('allows only one work order per job occurrence', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const workOrderRepository = new WorkOrderRepository();
      const { job } = await seedDocumentRefs(transaction);
      const workOrder = workOrderFixture({ jobId: job.id, occurrenceDate: '2026-10-01' });

      await workOrderRepository.create(workOrder, { transaction });

      await expect(workOrderRepository.create(workOrder, { transaction })).rejects.toMatchObject({
        name: 'SequelizeUniqueConstraintError',
        parent: { constraint: 'work_orders_job_occurrence_unique' },
      });
    });
  });

  it('moves status only via a CAS transition, refusing a stale "from"', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const workOrderRepository = new WorkOrderRepository();
      const { job } = await seedDocumentRefs(transaction);
      const workOrder = await workOrderRepository.create(
        workOrderFixture({ jobId: job.id, occurrenceDate: '2026-10-01' }),
        { transaction },
      );

      const changed = await workOrderRepository.transitionStatus(
        workOrder.id,
        ['dispatched'],
        { status: 'in_progress' },
        { transaction },
      );
      expect(changed).toBe(1);

      // Now actually 'in_progress' - a CAS still asking for 'dispatched' must not apply.
      const stale = await workOrderRepository.transitionStatus(
        workOrder.id,
        ['dispatched'],
        { status: 'canceled' },
        { transaction },
      );
      expect(stale).toBe(0);

      const found = await workOrderRepository.findById(workOrder.id, { transaction });
      expect(found.status).toBe('in_progress');
    });
  });

  it('rejects a work order whose job does not exist', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      await expect(
        new WorkOrderRepository().create(
          workOrderFixture({
            jobId: '00000000-0000-0000-0000-000000000000',
            occurrenceDate: '2026-10-01',
          }),
          { transaction },
        ),
      ).rejects.toMatchObject({ name: 'SequelizeForeignKeyConstraintError' });
    });
  });
});
