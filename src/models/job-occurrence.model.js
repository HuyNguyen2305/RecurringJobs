import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';
import { JOB_STATUSES } from '#constants/job-status.js';

/**
 * What happened to one occurrence of a job (completed, rescheduled, ...). One row per
 * (jobId, occurrenceDate), enforced by a unique index; created when the status first changes.
 */
export class JobOccurrence extends Model {}

JobOccurrence.init(
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
      type: DataTypes.ENUM(...JOB_STATUSES),
      allowNull: false,
      defaultValue: 'unconfirmed',
    },
    rescheduledTo: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rescheduled_to',
    },
    rescheduledFrom: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rescheduled_from',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    sequelize,
    modelName: 'JobOccurrence',
    tableName: 'job_occurrences',
    underscored: true,
  },
);
