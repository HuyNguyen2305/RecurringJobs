import { JobRepository } from '#repositories/job.repository.js';
import { CustomerRepository } from '#repositories/customer.repository.js';
import { LocationRepository } from '#repositories/location.repository.js';
import { ServiceTypeRepository } from '#repositories/service-type.repository.js';
import { InvoiceRepository } from '#repositories/invoice.repository.js';
import { sequelize } from '#common/database.js';
import { generateOccurrences } from '#common/recurrence-engine.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import customerFixture from '../../fixtures/customer.fixture.cjs';
import locationFixture from '../../fixtures/location.fixture.cjs';
import serviceTypeFixture from '../../fixtures/service-type.fixture.cjs';
import jobFixture from '../../fixtures/job.fixture.cjs';
import recurrenceRuleFixture from '../../fixtures/recurrence-rule.fixture.cjs';
import invoiceFixture from '../../fixtures/invoice.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

describe('InvoiceRepository (integration)', () => {
  it('creates an invoice for a valid occurrence and enforces one-per-occurrence', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const customerRepository = new CustomerRepository();
      const locationRepository = new LocationRepository();
      const serviceTypeRepository = new ServiceTypeRepository();
      const jobRepository = new JobRepository();
      const invoiceRepository = new InvoiceRepository();

      const customer = await customerRepository.create(customerFixture(), { transaction });
      const location = await locationRepository.create(locationFixture(customer.id), {
        transaction,
      });
      const serviceType = await serviceTypeRepository.create(serviceTypeFixture(), {
        transaction,
      });

      const job = await jobRepository.create(
        jobFixture(
          { customerId: customer.id, locationId: location.id, serviceTypeId: serviceType.id },
          { date: '2026-10-01', recurrence: recurrenceRuleFixture({ weeklyDaysOfWeek: [4] }) }, // weekly Thursday
        ),
        { transaction },
      );

      const [occurrenceDate] = generateOccurrences(job.recurrence, job.date, { limit: 1 });
      expect(occurrenceDate).toBe('2026-10-01');

      const invoice = await invoiceRepository.create(
        invoiceFixture({ jobId: job.id, occurrenceDate }),
        { transaction },
      );

      const found = await invoiceRepository.findByJobAndDate(job.id, occurrenceDate, {
        transaction,
      });
      expect(found).not.toBeNull();
      expect(found.id).toBe(invoice.id);
      expect(found.jobId).toBe(job.id);

      await expect(
        invoiceRepository.create(invoiceFixture({ jobId: job.id, occurrenceDate }), {
          transaction,
        }),
      ).rejects.toThrow();
    });
  });
});
