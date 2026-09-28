import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';

/**
 * Line items for customer documents (estimates and invoices). `parentId` is a real FK to
 * customer_documents (ON DELETE CASCADE); the parent's `type` says which kind it belongs to.
 */
export class CustomerLineItem extends Model {}

CustomerLineItem.init(
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
    quantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'unit_price',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'CustomerLineItem',
    tableName: 'customer_line_items',
    underscored: true,
  },
);
