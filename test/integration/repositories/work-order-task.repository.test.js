import { randomUUID } from 'node:crypto';
import { WorkOrderTaskRepository } from '#repositories/work-order-task.repository.js';
import { WorkOrderRepository } from '#repositories/work-order.repository.js';
import { sequelize } from '#common/database.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import { seedDocumentRefs } from '../../helpers/seed-documents.js';
import workOrderFixture from '../../fixtures/work-order.fixture.cjs';
import workOrderTaskFixture from '../../fixtures/work-order-task.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

async function seedTwoWorkOrders(transaction) {
  const workOrderRepository = new WorkOrderRepository();
  const { job } = await seedDocumentRefs(transaction);
  const first = await workOrderRepository.create(
    workOrderFixture({ jobId: job.id, occurrenceDate: '2026-10-01' }),
    { transaction },
  );
  const second = await workOrderRepository.create(
    workOrderFixture({ jobId: job.id, occurrenceDate: '2026-10-08' }),
    { transaction },
  );
  return { workOrderRepository, first, second };
}

describe('WorkOrderTaskRepository (integration)', () => {
  it('returns a work order’s tasks ordered by position, and several work orders’ tasks in one query', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new WorkOrderTaskRepository();
      const { first, second } = await seedTwoWorkOrders(transaction);

      await repository.bulkCreate(
        [
          workOrderTaskFixture(first.id, { description: 'first-b', position: 1 }),
          workOrderTaskFixture(first.id, { description: 'first-a', position: 0 }),
          workOrderTaskFixture(second.id, { description: 'second-a', position: 0 }),
        ],
        { transaction },
      );

      const tasks = await repository.findAllForParent(first.id, { transaction });
      expect(tasks.map((task) => task.description)).toEqual(['first-a', 'first-b']);
      expect(tasks[0].isDone).toBe(false);

      const both = await repository.findAllForParents([first.id, second.id], { transaction });
      expect(both).toHaveLength(3);
      expect(
        both.filter((task) => task.parentId === first.id).map((task) => task.description),
      ).toEqual(['first-a', 'first-b']);
    });
  });

  it('toggles a task only when it belongs to the given work order', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new WorkOrderTaskRepository();
      const { first, second } = await seedTwoWorkOrders(transaction);
      const [task] = await repository.bulkCreate([workOrderTaskFixture(first.id)], {
        transaction,
        returning: true,
      });

      const wrongParent = await repository.setDone(task.id, second.id, true, { transaction });
      expect(wrongParent).toBe(0);

      const rightParent = await repository.setDone(task.id, first.id, true, { transaction });
      expect(rightParent).toBe(1);

      const [reloaded] = await repository.findAllForParent(first.id, { transaction });
      expect(reloaded.isDone).toBe(true);
    });
  });

  it('deletes a work order’s tasks when the work order is deleted', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new WorkOrderTaskRepository();
      const { workOrderRepository, first } = await seedTwoWorkOrders(transaction);
      await repository.bulkCreate([workOrderTaskFixture(first.id)], { transaction });

      await workOrderRepository.scoped().destroy({ where: { id: first.id }, transaction });

      await expect(repository.findAllForParent(first.id, { transaction })).resolves.toEqual([]);
    });
  });

  it('rejects a task whose parent work order does not exist', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      await expect(
        new WorkOrderTaskRepository().bulkCreate([workOrderTaskFixture(randomUUID())], {
          transaction,
        }),
      ).rejects.toMatchObject({ name: 'SequelizeForeignKeyConstraintError' });
    });
  });
});
