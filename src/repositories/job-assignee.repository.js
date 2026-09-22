import { Baserepository } from '#common/base-repository.js';
import { JobAssignee } from '#models/job-assignee.model.js';

export class JobAssigneeRepository extends Baserepository {
  constructor() {
    super(JobAssignee);
  }

  async bulkCreate(rows, options = {}) {
    return this.scoped().bulkCreate(rows, options);
  }
}
