import { CONTROLLER_KEYS } from '#constants/singleton.js';
import {
  createWorkOrderSchema,
  getWorkOrderSchema,
  listJobWorkOrdersSchema,
  updateWorkOrderStatusSchema,
  updateWorkOrderTaskSchema,
} from '#schemas/work-order.schema.js';

export default async function workOrderRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.WORK_ORDER);

  fastify.post('/jobs/:id/work-orders', { schema: createWorkOrderSchema }, controller.create);
  fastify.get('/jobs/:id/work-orders', { schema: listJobWorkOrdersSchema }, controller.listForJob);
  fastify.get('/work-orders/:id', { schema: getWorkOrderSchema }, controller.getById);
  fastify.patch(
    '/work-orders/:id/status',
    { schema: updateWorkOrderStatusSchema },
    controller.updateStatus,
  );
  fastify.patch(
    '/work-orders/:id/tasks/:taskId',
    { schema: updateWorkOrderTaskSchema },
    controller.updateTask,
  );
}
