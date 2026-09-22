import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';
import { Customer } from '#models/customer.model.js';

export class Location extends Model {}

Location.init(
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
    addressLine1: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'address_line1',
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    zip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Location',
    tableName: 'locations',
    underscored: true,
  },
);

Location.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Customer.hasMany(Location, { foreignKey: 'customerId', as: 'locations' });
