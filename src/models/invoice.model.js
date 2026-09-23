import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';
import { Job } from '#models/job.model.js';

export const INVOICE_STATUSES = ['draft', 'sent', 'paid'];

export class Invoice extends Model {}

Invoice.init(
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
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...INVOICE_STATUSES),
      allowNull: false,
      defaultValue: 'draft',
    },
    jobSnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'job_snapshot',
    },
  },
  {
    sequelize,
    modelName: 'Invoice',
    tableName: 'invoices',
    underscored: true,
  },
);

Invoice.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
