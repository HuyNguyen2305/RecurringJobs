import { CONTROLLER_KEYS } from '#constants/singleton.js';
import {
  createEstimateSchema,
  getEstimateSchema,
  updateEstimateStatusSchema,
  convertEstimateSchema,
} from '#schemas/estimate.schema.js';

export default async function estimateRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.ESTIMATE);

  fastify.post('/estimates', { schema: createEstimateSchema }, controller.create);
  fastify.get('/estimates/:id', { schema: getEstimateSchema }, controller.getById);
  fastify.patch(
    '/estimates/:id/status',
    { schema: updateEstimateStatusSchema },
    controller.updateStatus,
  );
  fastify.post('/estimates/:id/convert', { schema: convertEstimateSchema }, controller.convert);
}
