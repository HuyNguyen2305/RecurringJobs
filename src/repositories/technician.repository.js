import { Baserepository } from '#common/base-repository.js';
import { Technician } from '#models/technician.model.js';

export class TechnicianRepository extends Baserepository {
  constructor() {
    super(Technician);
  }
}
