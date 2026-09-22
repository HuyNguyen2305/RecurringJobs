import { Baserepository } from '#common/base-repository.js';
import { Customer } from '#models/customer.model.js';

export class CustomerRepository extends Baserepository {
  constructor() {
    super(Customer);
  }
}
