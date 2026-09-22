import { Baserepository } from '#common/base-repository.js';
import { Job } from '#models/job.model.js';
import { Customer } from '#models/customer.model.js';
import { Location } from '#models/location.model.js';
import { ServiceType } from '#models/service-type.model.js';
import { Technician } from '#models/technician.model.js';
import { JobAssignee } from '#models/job-assignee.model.js';

const DEFAULT_INCLUDE = [
  { model: Customer, as: 'customer' },
  { model: Location, as: 'location' },
  { model: ServiceType, as: 'serviceType' },
  { model: Technician, as: 'soldBy' },
  {
    model: JobAssignee,
    as: 'assignees',
    include: [{ model: Technician, as: 'technician' }],
  },
];

export class JobRepository extends Baserepository {
  constructor() {
    super(Job);
  }

  async findById(id, options = {}) {
    return this.scoped().findByPk(id, { include: DEFAULT_INCLUDE, ...options });
  }

  async findAll(options = {}) {
    return this.scoped().findAll({ include: DEFAULT_INCLUDE, ...options });
  }

  async findAndCountAll(options = {}) {
    return this.scoped().findAndCountAll({
      include: DEFAULT_INCLUDE,
      distinct: true,
      ...options,
    });
  }
}
