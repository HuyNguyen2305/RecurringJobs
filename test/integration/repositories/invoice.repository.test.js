import { InvoiceRepository } from '#repositories/invoice.repository.js';
import { JobRepository } from '#repositories/job.repository.js';
import { sequelize } from '#common/database.js';
import { generateOccurrences } from '#common/recurrence-engine.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import { seedDocumentRefs } from '../../helpers/seed-documents.js';
import jobFixture from '../../fixtures/job.fixture.cjs';
import recurrenceRuleFixture from '../../fixtures/recurrence-rule.fixture.cjs';
import invoiceFixture from '../../fixtures/invoice.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

describe('InvoiceRepository (integration)', () => {
  it('finds invoices by job and date, and lists a job’s invoices newest first', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const invoiceRepository = new InvoiceRepository();
      const { refs } = await seedDocumentRefs(transaction);
      const job = await new JobRepository().create(
        jobFixture(refs, {
          date: '2026-10-01',
          recurrence: recurrenceRuleFixture({ weeklyDaysOfWeek: [4] }), // weekly Thursday
        }),
        { transaction },
      );
      const [first, second] = generateOccurrences(job.recurrence, job.date, { limit: 2 });

      const older = await invoiceRepository.create(
        invoiceFixture({ ...refs, jobId: job.id, occurrenceDate: first }),
        { transaction },
      );
      const newer = await invoiceRepository.create(
        invoiceFixture({ ...refs, jobId: job.id, occurrenceDate: second }),
        { transaction },
      );

      const found = await invoiceRepository.findByJobAndDate(job.id, first, { transaction });
      expect(found.id).toBe(older.id);
      await expect(
        invoiceRepository.findByJobAndDate(job.id, '2026-12-31', { transaction }),
      ).resolves.toBeNull();

      const list = await invoiceRepository.findAllForJob(job.id, { transaction });
      expect(list.map((invoice) => invoice.id)).toEqual([newer.id, older.id]);
    });
  });

  it('allows only one invoice per job occurrence', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const invoiceRepository = new InvoiceRepository();
      const { refs, job } = await seedDocumentRefs(transaction);
      const invoice = invoiceFixture({ ...refs, jobId: job.id, occurrenceDate: '2026-10-01' });

      await invoiceRepository.create(invoice, { transaction });

      await expect(invoiceRepository.create(invoice, { transaction })).rejects.toMatchObject({
        name: 'SequelizeUniqueConstraintError',
        parent: { constraint: 'customer_documents_invoice_occurrence_unique' },
      });
    });
  });
});
