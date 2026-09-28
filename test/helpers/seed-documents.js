import { CustomerRepository } from '#repositories/customer.repository.js';
import { LocationRepository } from '#repositories/location.repository.js';
import { ServiceTypeRepository } from '#repositories/service-type.repository.js';
import { JobRepository } from '#repositories/job.repository.js';
import customerFixture from '../fixtures/customer.fixture.cjs';
import locationFixture from '../fixtures/location.fixture.cjs';
import serviceTypeFixture from '../fixtures/service-type.fixture.cjs';
import jobFixture from '../fixtures/job.fixture.cjs';

/**
 * Seeds what a customer document hangs off - a customer, their location, a service type and
 * a one-off job on 2026-10-01 - inside the given (rolled-back) test transaction.
 */
export async function seedDocumentRefs(transaction) {
  const customer = await new CustomerRepository().create(customerFixture(), { transaction });
  const location = await new LocationRepository().create(locationFixture(customer.id), {
    transaction,
  });
  const serviceType = await new ServiceTypeRepository().create(serviceTypeFixture(), {
    transaction,
  });
  const refs = { customerId: customer.id, locationId: location.id, serviceTypeId: serviceType.id };
  const job = await new JobRepository().create(jobFixture(refs, { date: '2026-10-01' }), {
    transaction,
  });
  return { refs, job };
}
