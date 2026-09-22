import { requestContext } from '#common/request-context.js';

const DEFAULT_SCHEMA = 'public';

export class Baserepository {
  constructor(model) {
    this.model = model;
  }

  getSchema() {
    return requestContext.get('identity')?.tenantSchema || DEFAULT_SCHEMA;
  }

  scoped() {
    return this.model.schema(this.getSchema());
  }

  async create(data, options = {}) {
    return this.scoped().create(data, options);
  }

  async findById(id, options = {}) {
    return this.scoped().findByPk(id, options);
  }

  async findAll(options = {}) {
    return this.scoped().findAll(options);
  }

  async findAndCountAll(options = {}) {
    return this.scoped().findAndCountAll(options);
  }
}
