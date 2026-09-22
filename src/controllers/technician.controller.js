export class TechnicianController {
  constructor({ technicianService }) {
    this.technicianService = technicianService;
  }

  create = async (request, reply) => {
    const technician = await this.technicianService.create(request.body);
    reply.code(201).send({ success: true, message: 'Technician created', data: technician });
  };

  getById = async (request, reply) => {
    const technician = await this.technicianService.getById(request.params.id);
    reply.send({ success: true, message: 'Technician retrieved', data: technician });
  };
}
