export class JobOccurrenceController {
  constructor({ jobOccurrenceService }) {
    this.jobOccurrenceService = jobOccurrenceService;
  }

  getSchedule = async (request, reply) => {
    const { from, to, limit } = request.query;
    const schedule = await this.jobOccurrenceService.getSchedule(request.params.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
    reply.send({ success: true, message: 'Schedule retrieved', data: schedule });
  };

  updateStatus = async (request, reply) => {
    const occurrence = await this.jobOccurrenceService.updateStatus(
      request.params.id,
      request.params.date,
      request.body,
    );
    reply.send({ success: true, message: 'Occurrence status updated', data: occurrence });
  };
}
