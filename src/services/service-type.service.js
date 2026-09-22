import { NotFoundError } from '#common/error.js';

export class ServiceTypeService {
  constructor({ serviceTypeRepository }) {
    this.serviceTypeRepository = serviceTypeRepository;
  }

  async create(data) {
    return this.serviceTypeRepository.create(data);
  }

  async getById(id) {
    const serviceType = await this.serviceTypeRepository.findById(id);
    if (!serviceType) {
      throw new NotFoundError(`Service type ${id} not found`);
    }
    return serviceType;
  }
}
