import { randomUUID } from 'node:crypto';
import { CustomerLineItemRepository } from '#repositories/customer-line-item.repository.js';
import { EstimateRepository } from '#repositories/estimate.repository.js';
import { sequelize } from '#common/database.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import { seedDocumentRefs } from '../../helpers/seed-documents.js';
import estimateFixture from '../../fixtures/estimate.fixture.cjs';
import customerLineItemFixture from '../../fixtures/customer-line-item.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

async function seedTwoEstimates(transaction) {
  const estimateRepository = new EstimateRepository();
  const { refs } = await seedDocumentRefs(transaction);
  const first = await estimateRepository.create(estimateFixture(refs), { transaction });
  const second = await estimateRepository.create(estimateFixture(refs), { transaction });
  return { estimateRepository, first, second };
}

describe('CustomerLineItemRepository (integration)', () => {
  it('returns a document’s items ordered by position, and several documents’ items in one query', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new CustomerLineItemRepository();
      const { first, second } = await seedTwoEstimates(transaction);

      await repository.bulkCreate(
        [
          customerLineItemFixture(first.id, { description: 'first-b', position: 1 }),
          customerLineItemFixture(first.id, { description: 'first-a', position: 0 }),
          customerLineItemFixture(second.id, { description: 'second-a', position: 0 }),
        ],
        { transaction },
      );

      const items = await repository.findAllForParent(first.id, { transaction });
      expect(items.map((item) => item.description)).toEqual(['first-a', 'first-b']);
      expect(items[0].quantity).toBe('1.00');
      expect(items[0].unitPrice).toBe('10.00');

      const both = await repository.findAllForParents([first.id, second.id], { transaction });
      expect(both).toHaveLength(3);
      expect(
        both.filter((item) => item.parentId === first.id).map((item) => item.description),
      ).toEqual(['first-a', 'first-b']);
    });
  });

  it('deletes a document’s line items when the document is deleted', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const repository = new CustomerLineItemRepository();
      const { estimateRepository, first } = await seedTwoEstimates(transaction);
      await repository.bulkCreate([customerLineItemFixture(first.id)], { transaction });

      await estimateRepository.scoped().destroy({ where: { id: first.id }, transaction });

      await expect(repository.findAllForParent(first.id, { transaction })).resolves.toEqual([]);
    });
  });

  it('rejects a line item whose parent document does not exist', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      await expect(
        new CustomerLineItemRepository().bulkCreate([customerLineItemFixture(randomUUID())], {
          transaction,
        }),
      ).rejects.toMatchObject({ name: 'SequelizeForeignKeyConstraintError' });
    });
  });
});
