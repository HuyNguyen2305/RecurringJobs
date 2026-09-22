import { NotFoundError } from '#common/error.js';

export class LocationService {
  constructor({ locationRepository, customerRepository }) {
    this.locationRepository = locationRepository;
    this.customerRepository = customerRepository;
  }

  async create(data) {
    const customer = await this.customerRepository.findById(data.customerId);
    if (!customer) {
      throw new NotFoundError(`Customer ${data.customerId} not found`);
    }
    return this.locationRepository.create(data);
  }

  async getById(id) {
    const location = await this.locationRepository.findById(id);
    if (!location) {
      throw new NotFoundError(`Location ${id} not found`);
    }
    return location;
  }
}
