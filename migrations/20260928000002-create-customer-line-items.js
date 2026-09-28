'use strict';

// Line items for both estimates and invoices; the parent document's `type` says which.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customer_line_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customer_documents', key: 'id' },
        onDelete: 'CASCADE',
      },
      description: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      quantity: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      unit_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('customer_line_items', ['parent_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customer_line_items');
  },
};
