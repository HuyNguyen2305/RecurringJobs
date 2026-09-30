import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';
import { Job } from '#models/job.model.js';
import { WorkOrderTask } from '#models/work-order-task.model.js';

export const WORK_ORDER_STATUSES = ['dispatched', 'in_progress', 'completed', 'canceled'];

/**
 * A per-occurrence dispatch/completion record for a job - separate from the money-and-
 * line-items world of customer_documents (estimates/invoices). One work order per
 * (jobId, occurrenceDate), enforced by a unique index.
 */
export class WorkOrder extends Model {}

WorkOrder.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'job_id',
    },
    occurrenceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'occurrence_date',
    },
    status: {
      type: DataTypes.ENUM(...WORK_ORDER_STATUSES),
      allowNull: false,
      defaultValue: 'dispatched',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    sequelize,
    modelName: 'WorkOrder',
    tableName: 'work_orders',
    underscored: true,
  },
);

WorkOrder.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
WorkOrder.hasMany(WorkOrderTask, { foreignKey: 'parentId', as: 'tasks' });
