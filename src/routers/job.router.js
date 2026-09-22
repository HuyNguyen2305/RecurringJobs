import { CONTROLLER_KEYS } from '#constants/singleton.js';
import {
  createJobSchema,
  getJobSchema,
  getJobOccurrencesSchema,
  listJobsSchema,
} from '#schemas/job.schema.js';

export default async function jobRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.JOB);

  fastify.post('/jobs', { schema: createJobSchema }, controller.create);
  fastify.get('/jobs/:id', { schema: getJobSchema }, controller.getById);
  fastify.get(
    '/jobs/:id/occurrences',
    { schema: getJobOccurrencesSchema },
    controller.getOccurrences,
  );
  fastify.get('/jobs', { schema: listJobsSchema }, controller.list);
}
