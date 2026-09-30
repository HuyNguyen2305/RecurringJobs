'use strict';

// Checklist items for a work order.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('work_order_tasks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      description: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      is_done: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex('work_order_tasks', ['parent_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('work_order_tasks');
  },
};
