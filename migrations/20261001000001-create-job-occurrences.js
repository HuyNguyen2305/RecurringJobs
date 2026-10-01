'use strict';

// Per-occurrence status of a job. A recurring job is one `jobs` row whose occurrences are
// computed dates; a row here records what happened to one of them (completed, rescheduled...).
// Rows are created lazily the first time an occurrence's status changes.
module.exports = {
  async up(queryInterface, Sequelize) {
    // Not in a transaction: a new enum value cannot be added to a type inside one on older Postgres.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_jobs_status" ADD VALUE IF NOT EXISTS 'terminate_service';`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_jobs_status" ADD VALUE IF NOT EXISTS 'rescheduled';`,
    );

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'job_occurrences',
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
            type: Sequelize.ENUM(
              'unconfirmed',
              'confirmed',
              'in_progress',
              'completed',
              'canceled',
              'terminate_service',
              'rescheduled',
            ),
            allowNull: false,
            defaultValue: 'unconfirmed',
          },
          rescheduled_to: {
            type: Sequelize.DATEONLY,
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

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX job_occurrences_job_date_unique
           ON job_occurrences (job_id, occurrence_date);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE job_occurrences
           ADD CONSTRAINT job_occurrences_rescheduled_to_check
           CHECK ((status = 'rescheduled') = (rescheduled_to IS NOT NULL));`,
        { transaction },
      );
    });
  },

  // The two values added to enum_jobs_status stay: Postgres cannot drop an enum value.
  async down(queryInterface) {
    await queryInterface.dropTable('job_occurrences');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_job_occurrences_status";');
  },
};
