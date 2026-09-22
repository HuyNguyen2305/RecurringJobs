import { CONTROLLER_KEYS } from '#constants/singleton.js';
import { createServiceTypeSchema, getServiceTypeSchema } from '#schemas/service-type.schema.js';

export default async function serviceTypeRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.SERVICE_TYPE);

  fastify.post('/service-types', { schema: createServiceTypeSchema }, controller.create);
  fastify.get('/service-types/:id', { schema: getServiceTypeSchema }, controller.getById);
}
