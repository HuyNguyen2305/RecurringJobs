import { JobRepository } from '#repositories/job.repository.js';
import { CustomerRepository } from '#repositories/customer.repository.js';
import { LocationRepository } from '#repositories/location.repository.js';
import { ServiceTypeRepository } from '#repositories/service-type.repository.js';
import { sequelize } from '#common/database.js';
import { generateOccurrences } from '#common/recurrence-engine.js';
import { seedWithTransaction } from '../../helpers/seed-fixture.js';
import customerFixture from '../../fixtures/customer.fixture.cjs';
import locationFixture from '../../fixtures/location.fixture.cjs';
import serviceTypeFixture from '../../fixtures/service-type.fixture.cjs';
import jobFixture from '../../fixtures/job.fixture.cjs';
import recurrenceRuleFixture from '../../fixtures/recurrence-rule.fixture.cjs';

afterAll(async () => {
  await sequelize.close();
});

describe('JobRepository (integration)', () => {
  it('creates and finds a job with its relations included', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const customerRepository = new CustomerRepository();
      const locationRepository = new LocationRepository();
      const serviceTypeRepository = new ServiceTypeRepository();
      const jobRepository = new JobRepository();

      const customer = await customerRepository.create(customerFixture(), { transaction });
      const location = await locationRepository.create(locationFixture(customer.id), {
        transaction,
      });
      const serviceType = await serviceTypeRepository.create(serviceTypeFixture(), {
        transaction,
      });

      const created = await jobRepository.create(
        jobFixture({
          customerId: customer.id,
          locationId: location.id,
          serviceTypeId: serviceType.id,
        }),
        { transaction },
      );

      const found = await jobRepository.findById(created.id, { transaction });

      expect(found).not.toBeNull();
      expect(found.customerId).toBe(customer.id);
      expect(found.locationId).toBe(location.id);
      expect(found.serviceTypeId).toBe(serviceType.id);
      expect(found.customer.id).toBe(customer.id);
      expect(found.location.id).toBe(location.id);
      expect(found.serviceType.id).toBe(serviceType.id);
      expect(found.status).toBe('unconfirmed');
    });
  });

  it('persists a recurrence object on the job and expands it into occurrences', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const customerRepository = new CustomerRepository();
      const locationRepository = new LocationRepository();
      const serviceTypeRepository = new ServiceTypeRepository();
      const jobRepository = new JobRepository();

      const customer = await customerRepository.create(customerFixture(), { transaction });
      const location = await locationRepository.create(locationFixture(customer.id), {
        transaction,
      });
      const serviceType = await serviceTypeRepository.create(serviceTypeFixture(), {
        transaction,
      });

      const created = await jobRepository.create(
        jobFixture(
          { customerId: customer.id, locationId: location.id, serviceTypeId: serviceType.id },
          { date: '2026-10-01', recurrence: recurrenceRuleFixture({ weeklyDaysOfWeek: [4] }) }, // Thursday
        ),
        { transaction },
      );

      const found = await jobRepository.findById(created.id, { transaction });

      expect(found.recurrence).not.toBeNull();
      expect(found.recurrence.frequency).toBe('weekly');

      const occurrences = generateOccurrences(found.recurrence, found.date, { limit: 3 });
      expect(occurrences).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
    });
  });

  it('persists except=frequency and excludes the referenced job’s dates', async () => {
    await seedWithTransaction(async ({ transaction }) => {
      const customerRepository = new CustomerRepository();
      const locationRepository = new LocationRepository();
      const serviceTypeRepository = new ServiceTypeRepository();
      const jobRepository = new JobRepository();

      const customer = await customerRepository.create(customerFixture(), { transaction });
      const location = await locationRepository.create(locationFixture(customer.id), {
        transaction,
      });
      const serviceType = await serviceTypeRepository.create(serviceTypeFixture(), {
        transaction,
      });

      const jobA = await jobRepository.create(
        jobFixture(
          { customerId: customer.id, locationId: location.id, serviceTypeId: serviceType.id },
          { date: '2026-10-01', recurrence: recurrenceRuleFixture({ weeklyDaysOfWeek: [4] }) }, // Thursday, weekly
        ),
        { transaction },
      );

      const jobB = await jobRepository.create(
        jobFixture(
          { customerId: customer.id, locationId: location.id, serviceTypeId: serviceType.id },
          {
            date: '2026-10-01',
            recurrence: recurrenceRuleFixture({
              frequency: 'daily',
              weeklyPeriod: null,
              weeklyDaysOfWeek: null,
              exceptType: 'frequency',
              exceptJobId: jobA.id,
            }),
          },
        ),
        { transaction },
      );

      const foundA = await jobRepository.findById(jobA.id, { transaction });
      const foundB = await jobRepository.findById(jobB.id, { transaction });

      expect(foundB.recurrence.exceptType).toBe('frequency');
      expect(foundB.recurrence.exceptJobId).toBe(jobA.id);

      const range = { from: '2026-10-01', to: '2026-10-08' };
      const excludeDates = generateOccurrences(foundA.recurrence, foundA.date, range);
      const occurrencesB = generateOccurrences(foundB.recurrence, foundB.date, {
        ...range,
        excludeDates,
      });

      expect(excludeDates).toEqual(['2026-10-01', '2026-10-08']);
      expect(occurrencesB).toEqual([
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
      ]);
    });
  });
});
