'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'work_orders',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          job_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'jobs', key: 'id' },
            onDelete: 'RESTRICT',
          },
          occurrence_date: {
            type: Sequelize.DATEONLY,
            allowNull: false,
          },
          status: {
            type: Sequelize.ENUM('dispatched', 'in_progress', 'completed', 'canceled'),
            allowNull: false,
            defaultValue: 'dispatched',
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          completed_at: {
            type: Sequelize.DATE,
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
        },
        { transaction },
      );

      await queryInterface.addIndex('work_orders', ['job_id'], { transaction });

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX work_orders_job_occurrence_unique
           ON work_orders (job_id, occurrence_date);`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('work_orders');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_work_orders_status";');
  },
};
