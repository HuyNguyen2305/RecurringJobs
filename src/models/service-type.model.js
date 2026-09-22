import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';

export class ServiceType extends Model {}

ServiceType.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'ServiceType',
    tableName: 'service_types',
    underscored: true,
  },
);
