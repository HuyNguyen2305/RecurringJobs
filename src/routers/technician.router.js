import { CONTROLLER_KEYS } from '#constants/singleton.js';
import { createTechnicianSchema, getTechnicianSchema } from '#schemas/technician.schema.js';

export default async function technicianRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.TECHNICIAN);

  fastify.post('/technicians', { schema: createTechnicianSchema }, controller.create);
  fastify.get('/technicians/:id', { schema: getTechnicianSchema }, controller.getById);
}
