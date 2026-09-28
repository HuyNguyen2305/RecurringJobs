import { EstimateRepository } from '#repositories/estimate.repository.js';
import { InvoiceRepository } from '#repositories/invoice.repository.js';
import { sequelize } from '#common/database.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import { seedDocumentRefs } from '../../helpers/seed-documents.js';
import estimateFixture from '../../fixtures/estimate.fixture.cjs';
import invoiceFixture from '../../fixtures/invoice.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

const TYPE_FIELDS_CHECK = 'customer_documents_type_fields_check';
const STATUS_CHECK = 'customer_documents_status_check';

// Each test ends with the statement expected to fail: Postgres aborts the rest of a
// transaction after an error.
describe('customer_documents constraints (integration)', () => {
  it('pins each repository to its own type', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const estimates = new EstimateRepository();
      const invoices = new InvoiceRepository();
      const { refs, job } = await seedDocumentRefs(transaction);

      const estimate = await estimates.create(estimateFixture(refs), { transaction });
      const invoice = await invoices.create(
        invoiceFixture({ ...refs, jobId: job.id, occurrenceDate: '2026-10-01' }),
        { transaction },
      );

      expect(estimate.type).toBe('estimate');
      expect(invoice.type).toBe('invoice');
      await expect(invoices.findById(estimate.id, { transaction })).resolves.toBeNull();
      await expect(estimates.findById(invoice.id, { transaction })).resolves.toBeNull();
      await expect(
        estimates.transitionStatus(invoice.id, 'draft', 'sent', { transaction }),
      ).resolves.toBe(0);
    });
  });

  it('rejects an invoice without an occurrence date', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const { refs, job } = await seedDocumentRefs(transaction);

      await expect(
        new InvoiceRepository().create(
          invoiceFixture({ ...refs, jobId: job.id, occurrenceDate: null }),
          { transaction },
        ),
      ).rejects.toMatchObject({ parent: { constraint: TYPE_FIELDS_CHECK } });
    });
  });

  it('rejects an estimate with an occurrence date', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const { refs } = await seedDocumentRefs(transaction);

      await expect(
        new EstimateRepository().create(estimateFixture(refs, { occurrenceDate: '2026-10-01' }), {
          transaction,
        }),
      ).rejects.toMatchObject({ parent: { constraint: TYPE_FIELDS_CHECK } });
    });
  });

  it('rejects linking a job to an estimate that is not approved', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const estimates = new EstimateRepository();
      const { refs, job } = await seedDocumentRefs(transaction);
      const estimate = await estimates.create(estimateFixture(refs), { transaction });

      await expect(
        estimates.linkJob(estimate.id, job.id, { note: 'snapshot' }, { transaction }),
      ).rejects.toMatchObject({ parent: { constraint: TYPE_FIELDS_CHECK } });
    });
  });

  it('rejects an estimate job link without a snapshot', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const estimates = new EstimateRepository();
      const { refs, job } = await seedDocumentRefs(transaction);
      const estimate = await estimates.create(estimateFixture(refs, { status: 'approved' }), {
        transaction,
      });

      await expect(
        estimates.linkJob(estimate.id, job.id, null, { transaction }),
      ).rejects.toMatchObject({ parent: { constraint: TYPE_FIELDS_CHECK } });
    });
  });

  it('rejects an invoice-only status on an estimate', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const { refs } = await seedDocumentRefs(transaction);

      await expect(
        new EstimateRepository().create(estimateFixture(refs, { status: 'paid' }), {
          transaction,
        }),
      ).rejects.toMatchObject({ parent: { constraint: STATUS_CHECK } });
    });
  });

  it('rejects an estimate-only status on an invoice', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const { refs, job } = await seedDocumentRefs(transaction);

      await expect(
        new InvoiceRepository().create(
          invoiceFixture(
            { ...refs, jobId: job.id, occurrenceDate: '2026-10-01' },
            { status: 'approved' },
          ),
          { transaction },
        ),
      ).rejects.toMatchObject({ parent: { constraint: STATUS_CHECK } });
    });
  });
});
