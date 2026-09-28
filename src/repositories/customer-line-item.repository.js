import { Op } from 'sequelize';
import { Baserepository } from '#common/base-repository.js';
import { CustomerLineItem } from '#models/customer-line-item.model.js';

export class CustomerLineItemRepository extends Baserepository {
  constructor() {
    super(CustomerLineItem);
  }

  async bulkCreate(rows, options = {}) {
    return this.scoped().bulkCreate(rows, options);
  }

  async findAllForParent(parentId, options = {}) {
    return this.scoped().findAll({
      where: { parentId },
      order: [['position', 'ASC']],
      ...options,
    });
  }

  // One query for several documents (e.g. a job's invoice list) instead of one per document.
  async findAllForParents(parentIds, options = {}) {
    return this.scoped().findAll({
      where: { parentId: { [Op.in]: parentIds } },
      order: [
        ['parentId', 'ASC'],
        ['position', 'ASC'],
      ],
      ...options,
    });
  }
}
