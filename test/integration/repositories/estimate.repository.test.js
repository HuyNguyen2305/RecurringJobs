import { EstimateRepository } from '#repositories/estimate.repository.js';
import { sequelize } from '#common/database.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import { seedDocumentRefs } from '../../helpers/seed-documents.js';
import estimateFixture from '../../fixtures/estimate.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

describe('EstimateRepository (integration)', () => {
  it('finds an estimate with its relations, and the job it was converted into', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const estimateRepository = new EstimateRepository();
      const { refs, job } = await seedDocumentRefs(transaction);
      const estimate = await estimateRepository.create(
        estimateFixture(refs, { status: 'approved' }),
        { transaction },
      );

      const beforeConvert = await estimateRepository.findById(estimate.id, { transaction });
      expect(beforeConvert.customer.name).toBe('Fixture Customer');
      expect(beforeConvert.location.addressLine1).toBe('1 Wall Street');
      expect(beforeConvert.serviceType.name).toBe('Fixture Service');
      expect(beforeConvert.job).toBeNull();

      await expect(
        estimateRepository.linkJob(estimate.id, job.id, { date: '2026-10-01' }, { transaction }),
      ).resolves.toBe(1);

      const afterConvert = await estimateRepository.findById(estimate.id, { transaction });
      expect(afterConvert.jobId).toBe(job.id);
      expect(afterConvert.jobSnapshot).toEqual({ date: '2026-10-01' });
      expect(afterConvert.job.id).toBe(job.id);
    });
  });

  it('findByIdForUpdate returns the estimate inside the locking transaction', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const estimateRepository = new EstimateRepository();
      const { refs } = await seedDocumentRefs(transaction);
      const estimate = await estimateRepository.create(estimateFixture(refs), { transaction });

      const locked = await estimateRepository.findByIdForUpdate(estimate.id, { transaction });

      expect(locked.id).toBe(estimate.id);
      expect(locked.status).toBe('draft');
    });
  });

  it('transitionStatus only changes an estimate that is still in the expected status', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const estimateRepository = new EstimateRepository();
      const { refs } = await seedDocumentRefs(transaction);
      const estimate = await estimateRepository.create(estimateFixture(refs), { transaction });

      await expect(
        estimateRepository.transitionStatus(estimate.id, 'draft', 'sent', { transaction }),
      ).resolves.toBe(1);
      // A second caller still believing the estimate is a draft loses the compare-and-set.
      await expect(
        estimateRepository.transitionStatus(estimate.id, 'draft', 'sent', { transaction }),
      ).resolves.toBe(0);

      const found = await estimateRepository.findById(estimate.id, { transaction });
      expect(found.status).toBe('sent');
    });
  });

  it('allows a job to be linked to only one estimate', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const estimateRepository = new EstimateRepository();
      const { refs, job } = await seedDocumentRefs(transaction);
      const first = await estimateRepository.create(estimateFixture(refs, { status: 'approved' }), {
        transaction,
      });
      const second = await estimateRepository.create(
        estimateFixture(refs, { status: 'approved' }),
        { transaction },
      );

      await estimateRepository.linkJob(first.id, job.id, {}, { transaction });

      await expect(
        estimateRepository.linkJob(second.id, job.id, {}, { transaction }),
      ).rejects.toMatchObject({
        name: 'SequelizeUniqueConstraintError',
        parent: { constraint: 'customer_documents_estimate_job_unique' },
      });
    });
  });
});
