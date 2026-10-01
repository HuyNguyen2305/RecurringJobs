'use strict';

// A rescheduled occurrence gets its own row on the date it moves to; rescheduled_from points
// back at the date it came from, so that row is a visit of its own, not a recurrence date.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'job_occurrences',
        'rescheduled_from',
        { type: Sequelize.DATEONLY, allowNull: true },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE job_occurrences
           ADD CONSTRAINT job_occurrences_rescheduled_from_check
           CHECK (rescheduled_from IS NULL OR rescheduled_from < occurrence_date);`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE job_occurrences DROP CONSTRAINT IF EXISTS job_occurrences_rescheduled_from_check;',
    );
    await queryInterface.removeColumn('job_occurrences', 'rescheduled_from');
  },
};
