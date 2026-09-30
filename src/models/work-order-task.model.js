import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';

// Checklist items for a work order. `parentId` is a real FK to work_orders (ON DELETE CASCADE).
export class WorkOrderTask extends Model {}

WorkOrderTask.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    parentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'parent_id',
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isDone: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_done',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'WorkOrderTask',
    tableName: 'work_order_tasks',
    underscored: true,
  },
);
