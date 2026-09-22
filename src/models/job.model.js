import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';
import { Customer } from '#models/customer.model.js';
import { Location } from '#models/location.model.js';
import { ServiceType } from '#models/service-type.model.js';
import { Technician } from '#models/technician.model.js';

export const JOB_STATUSES = ['unconfirmed', 'confirmed', 'in_progress', 'completed', 'canceled'];

export class Job extends Model {}

Job.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'customer_id',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'location_id',
    },
    serviceTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'service_type_id',
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
      field: 'start_time',
    },
    lengthMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'length_minutes',
    },
    timeWindowStart: {
      type: DataTypes.TIME,
      allowNull: true,
      field: 'time_window_start',
    },
    timeWindowEnd: {
      type: DataTypes.TIME,
      allowNull: true,
      field: 'time_window_end',
    },
    soldByTechnicianId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'sold_by_technician_id',
    },
    status: {
      type: DataTypes.ENUM(...JOB_STATUSES),
      allowNull: false,
      defaultValue: 'unconfirmed',
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_locked',
    },
    notifyTechnician: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'notify_technician',
    },
    notifyCustomer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'notify_customer',
    },
    notificationTemplateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'notification_template_id',
    },
    recurrence: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Job',
    tableName: 'jobs',
    underscored: true,
  },
);

Job.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Job.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });
Job.belongsTo(ServiceType, { foreignKey: 'serviceTypeId', as: 'serviceType' });
Job.belongsTo(Technician, { foreignKey: 'soldByTechnicianId', as: 'soldBy' });
