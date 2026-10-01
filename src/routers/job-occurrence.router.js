import { CONTROLLER_KEYS } from '#constants/singleton.js';
import {
  getJobScheduleSchema,
  updateOccurrenceStatusSchema,
} from '#schemas/job-occurrence.schema.js';

export default async function jobOccurrenceRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.JOB_OCCURRENCE);

  fastify.get('/jobs/:id/schedule', { schema: getJobScheduleSchema }, controller.getSchedule);
  fastify.patch(
    '/jobs/:id/occurrences/:date/status',
    { schema: updateOccurrenceStatusSchema },
    controller.updateStatus,
  );
}
