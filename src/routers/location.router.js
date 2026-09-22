import { CONTROLLER_KEYS } from '#constants/singleton.js';
import { createLocationSchema, getLocationSchema } from '#schemas/location.schema.js';

export default async function locationRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.LOCATION);

  fastify.post('/locations', { schema: createLocationSchema }, controller.create);
  fastify.get('/locations/:id', { schema: getLocationSchema }, controller.getById);
}
