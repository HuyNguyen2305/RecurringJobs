import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';

export class Technician extends Model {}

Technician.init(
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
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Technician',
    tableName: 'technicians',
    underscored: true,
  },
);
