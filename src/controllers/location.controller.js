export class LocationController {
  constructor({ locationService }) {
    this.locationService = locationService;
  }

  create = async (request, reply) => {
    const location = await this.locationService.create(request.body);
    reply.code(201).send({ success: true, message: 'Location created', data: location });
  };

  getById = async (request, reply) => {
    const location = await this.locationService.getById(request.params.id);
    reply.send({ success: true, message: 'Location retrieved', data: location });
  };
}
