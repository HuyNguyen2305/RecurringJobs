import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';
import { Job } from '#models/job.model.js';
import { Technician } from '#models/technician.model.js';

export class JobAssignee extends Model {}

JobAssignee.init(
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
    technicianId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'technician_id',
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_primary',
    },
  },
  {
    sequelize,
    modelName: 'JobAssignee',
    tableName: 'job_assignees',
    underscored: true,
  },
);

Job.hasMany(JobAssignee, { foreignKey: 'jobId', as: 'assignees' });
JobAssignee.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
JobAssignee.belongsTo(Technician, { foreignKey: 'technicianId', as: 'technician' });
