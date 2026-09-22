import { NotFoundError } from '#common/error.js';

export class TechnicianService {
  constructor({ technicianRepository }) {
    this.technicianRepository = technicianRepository;
  }

  async create(data) {
    return this.technicianRepository.create(data);
  }

  async getById(id) {
    const technician = await this.technicianRepository.findById(id);
    if (!technician) {
      throw new NotFoundError(`Technician ${id} not found`);
    }
    return technician;
  }
}
