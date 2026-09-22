export class CustomerController {
  constructor({ customerService }) {
    this.customerService = customerService;
  }

  create = async (request, reply) => {
    const customer = await this.customerService.create(request.body);
    reply.code(201).send({ success: true, message: 'Customer created', data: customer });
  };

  getById = async (request, reply) => {
    const customer = await this.customerService.getById(request.params.id);
    reply.send({ success: true, message: 'Customer retrieved', data: customer });
  };
}
