import { Baserepository } from '#common/base-repository.js';
import { ServiceType } from '#models/service-type.model.js';

export class ServiceTypeRepository extends Baserepository {
  constructor() {
    super(ServiceType);
  }
}
