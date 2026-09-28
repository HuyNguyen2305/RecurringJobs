import { Baserepository } from '#common/base-repository.js';
import { CustomerDocument } from '#models/customer-document.model.js';

/**
 * Base for the type-scoped document repositories. Every read and write is pinned to one
 * `type`, so an estimate can never be read or changed through the invoice repository
 * (and vice versa) even though both live in customer_documents.
 */
export class CustomerDocumentRepository extends Baserepository {
  constructor(type) {
    super(CustomerDocument);
    this.type = type;
  }

  withType(where = {}) {
    return { ...where, type: this.type };
  }

  async create(data, options = {}) {
    return this.scoped().create({ ...data, type: this.type }, options);
  }

  async findById(id, options = {}) {
    const { where, ...rest } = options;
    return this.scoped().findOne({ ...rest, where: this.withType({ ...where, id }) });
  }

  async findAll(options = {}) {
    return this.scoped().findAll({ ...options, where: this.withType(options.where) });
  }

  async findAndCountAll(options = {}) {
    return this.scoped().findAndCountAll({ ...options, where: this.withType(options.where) });
  }
}
