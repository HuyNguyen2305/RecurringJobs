export class EstimateController {
  constructor({ estimateService }) {
    this.estimateService = estimateService;
  }

  create = async (request, reply) => {
    const estimate = await this.estimateService.create(request.body);
    reply.code(201).send({ success: true, message: 'Estimate created', data: estimate });
  };

  getById = async (request, reply) => {
    const estimate = await this.estimateService.getById(request.params.id);
    reply.send({ success: true, message: 'Estimate retrieved', data: estimate });
  };

  updateStatus = async (request, reply) => {
    const estimate = await this.estimateService.updateStatus(
      request.params.id,
      request.body.status,
    );
    reply.send({ success: true, message: 'Estimate status updated', data: estimate });
  };

  convert = async (request, reply) => {
    const job = await this.estimateService.convertToJob(request.params.id, request.body);
    reply.code(201).send({ success: true, message: 'Estimate converted to job', data: job });
  };
}
