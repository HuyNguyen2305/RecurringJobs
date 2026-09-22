import { NotFoundError } from '#common/error.js';

export class CustomerService {
  constructor({ customerRepository }) {
    this.customerRepository = customerRepository;
  }

  async create(data) {
    return this.customerRepository.create(data);
  }

  async getById(id) {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundError(`Customer ${id} not found`);
    }
    return customer;
  }
}
