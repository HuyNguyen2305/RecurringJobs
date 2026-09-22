import { CONTROLLER_KEYS } from '#constants/singleton.js';
import { createCustomerSchema, getCustomerSchema } from '#schemas/customer.schema.js';

export default async function customerRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.CUSTOMER);

  fastify.post('/customers', { schema: createCustomerSchema }, controller.create);
  fastify.get('/customers/:id', { schema: getCustomerSchema }, controller.getById);
}
