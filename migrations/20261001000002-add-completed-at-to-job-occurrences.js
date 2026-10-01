'use strict';

// When an occurrence was completed, like work_orders.completed_at.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'job_occurrences',
        'completed_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );

      // Rows completed before this column existed: the last update is the best estimate.
      await queryInterface.sequelize.query(
        `UPDATE job_occurrences SET completed_at = updated_at WHERE status = 'completed';`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE job_occurrences
           ADD CONSTRAINT job_occurrences_completed_at_check
           CHECK ((status = 'completed') = (completed_at IS NOT NULL));`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE job_occurrences DROP CONSTRAINT IF EXISTS job_occurrences_completed_at_check;',
    );
    await queryInterface.removeColumn('job_occurrences', 'completed_at');
  },
};
