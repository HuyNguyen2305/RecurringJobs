import { asClass, createContainer, InjectionMode } from 'awilix';

import { REPOSITORY_KEYS, SERVICE_KEYS, CONTROLLER_KEYS } from '#constants/singleton.js';

import { CustomerRepository } from '#repositories/customer.repository.js';
import { LocationRepository } from '#repositories/location.repository.js';
import { ServiceTypeRepository } from '#repositories/service-type.repository.js';
import { TechnicianRepository } from '#repositories/technician.repository.js';
import { JobRepository } from '#repositories/job.repository.js';
import { JobAssigneeRepository } from '#repositories/job-assignee.repository.js';
import { InvoiceRepository } from '#repositories/invoice.repository.js';

import { CustomerService } from '#service/customer.service.js';
import { LocationService } from '#service/location.service.js';
import { ServiceTypeService } from '#service/service-type.service.js';
import { TechnicianService } from '#service/technician.service.js';
import { JobService } from '#service/job.service.js';
import { InvoiceService } from '#service/invoice.service.js';

import { CustomerController } from '#controllers/customer.controller.js';
import { LocationController } from '#controllers/location.controller.js';
import { ServiceTypeController } from '#controllers/service-type.controller.js';
import { TechnicianController } from '#controllers/technician.controller.js';
import { JobController } from '#controllers/job.controller.js';
import { InvoiceController } from '#controllers/invoice.controller.js';

export function buildContainer() {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });

  container.register({
    [REPOSITORY_KEYS.CUSTOMER]: asClass(CustomerRepository).singleton(),
    [REPOSITORY_KEYS.LOCATION]: asClass(LocationRepository).singleton(),
    [REPOSITORY_KEYS.SERVICE_TYPE]: asClass(ServiceTypeRepository).singleton(),
    [REPOSITORY_KEYS.TECHNICIAN]: asClass(TechnicianRepository).singleton(),
    [REPOSITORY_KEYS.JOB]: asClass(JobRepository).singleton(),
    [REPOSITORY_KEYS.JOB_ASSIGNEE]: asClass(JobAssigneeRepository).singleton(),
    [REPOSITORY_KEYS.INVOICE]: asClass(InvoiceRepository).singleton(),

    [SERVICE_KEYS.CUSTOMER]: asClass(CustomerService).singleton(),
    [SERVICE_KEYS.LOCATION]: asClass(LocationService).singleton(),
    [SERVICE_KEYS.SERVICE_TYPE]: asClass(ServiceTypeService).singleton(),
    [SERVICE_KEYS.TECHNICIAN]: asClass(TechnicianService).singleton(),
    [SERVICE_KEYS.JOB]: asClass(JobService).singleton(),
    [SERVICE_KEYS.INVOICE]: asClass(InvoiceService).singleton(),

    [CONTROLLER_KEYS.CUSTOMER]: asClass(CustomerController).singleton(),
    [CONTROLLER_KEYS.LOCATION]: asClass(LocationController).singleton(),
    [CONTROLLER_KEYS.SERVICE_TYPE]: asClass(ServiceTypeController).singleton(),
    [CONTROLLER_KEYS.TECHNICIAN]: asClass(TechnicianController).singleton(),
    [CONTROLLER_KEYS.JOB]: asClass(JobController).singleton(),
    [CONTROLLER_KEYS.INVOICE]: asClass(InvoiceController).singleton(),
  });

  return container;
}
