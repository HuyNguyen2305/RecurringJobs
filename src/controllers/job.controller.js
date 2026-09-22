export class JobController {
  constructor({ jobService }) {
    this.jobService = jobService;
  }

  create = async (request, reply) => {
    const job = await this.jobService.create(request.body);
    reply.code(201).send({ success: true, message: 'Job created', data: job });
  };

  getById = async (request, reply) => {
    const job = await this.jobService.getById(request.params.id);
    reply.send({ success: true, message: 'Job retrieved', data: job });
  };

  getOccurrences = async (request, reply) => {
    const { from, to, limit } = request.query;
    const occurrences = await this.jobService.getOccurrences(request.params.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
    reply.send({ success: true, message: 'Occurrences retrieved', data: occurrences });
  };

  list = async (request, reply) => {
    const { page, pageSize } = request.query;
    const result = await this.jobService.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    reply.send({
      success: true,
      message: 'Jobs retrieved',
      data: result.data,
      pagination: result.pagination,
    });
  };
}
