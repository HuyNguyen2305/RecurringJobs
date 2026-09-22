export class ServiceTypeController {
  constructor({ serviceTypeService }) {
    this.serviceTypeService = serviceTypeService;
  }

  create = async (request, reply) => {
    const serviceType = await this.serviceTypeService.create(request.body);
    reply.code(201).send({ success: true, message: 'Service type created', data: serviceType });
  };

  getById = async (request, reply) => {
    const serviceType = await this.serviceTypeService.getById(request.params.id);
    reply.send({ success: true, message: 'Service type retrieved', data: serviceType });
  };
}
