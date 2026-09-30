import { Op } from 'sequelize';
import { Baserepository } from '#common/base-repository.js';
import { WorkOrderTask } from '#models/work-order-task.model.js';

export class WorkOrderTaskRepository extends Baserepository {
  constructor() {
    super(WorkOrderTask);
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

  // One query for several work orders (e.g. a job's work order list) instead of one per order.
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

  async setDone(id, parentId, isDone, options = {}) {
    const [count] = await this.scoped().update({ isDone }, { where: { id, parentId }, ...options });
    return count;
  }
}
