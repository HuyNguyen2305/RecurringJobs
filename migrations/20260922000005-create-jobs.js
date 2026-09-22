'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('jobs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'RESTRICT',
      },
      location_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'locations', key: 'id' },
        onDelete: 'RESTRICT',
      },
      service_type_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'service_types', key: 'id' },
        onDelete: 'RESTRICT',
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      start_time: {
        type: Sequelize.TIME,
        allowNull: false,
      },
      length_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      time_window_start: {
        type: Sequelize.TIME,
        allowNull: true,
      },
      time_window_end: {
        type: Sequelize.TIME,
        allowNull: true,
      },
      sold_by_technician_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'technicians', key: 'id' },
        onDelete: 'SET NULL',
      },
      status: {
        type: Sequelize.ENUM('unconfirmed', 'confirmed', 'in_progress', 'completed', 'canceled'),
        allowNull: false,
        defaultValue: 'unconfirmed',
      },
      is_locked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notify_technician: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notify_customer: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notification_template_id: {
        type: Sequelize.UUID,
        allowNull: true,
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

    await queryInterface.addIndex('jobs', ['customer_id']);
    await queryInterface.addIndex('jobs', ['location_id']);
    await queryInterface.addIndex('jobs', ['date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('jobs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_jobs_status";');
  },
};
