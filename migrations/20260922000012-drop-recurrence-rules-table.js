'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('recurrence_rules');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_recurrence_rules_frequency";');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_recurrence_rules_weekly_period";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_recurrence_rules_monthly_repeat_by";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_recurrence_rules_yearly_repeat_by";',
    );
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_recurrence_rules_ends_type";');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_recurrence_rules_except_type";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_recurrence_rules_except_condition_period";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_recurrence_rules_except_condition_every";',
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('recurrence_rules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      frequency: {
        type: Sequelize.ENUM('daily', 'weekly', 'monthly', 'yearly'),
        allowNull: false,
      },
      interval: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      weekly_period: {
        type: Sequelize.ENUM('first_third', 'second_fourth', 'every'),
        allowNull: true,
      },
      weekly_days_of_week: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: true,
      },
      monthly_repeat_by: {
        type: Sequelize.ENUM('day_of_week', 'day_of_month'),
        allowNull: true,
      },
      yearly_repeat_by: {
        type: Sequelize.ENUM('day_of_week', 'day_of_year'),
        allowNull: true,
      },
      ends_type: {
        type: Sequelize.ENUM('never', 'after', 'on_date'),
        allowNull: false,
        defaultValue: 'never',
      },
      ends_after_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      ends_on_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      except_type: {
        type: Sequelize.ENUM('off', 'month', 'condition', 'frequency'),
        allowNull: false,
        defaultValue: 'off',
      },
      except_months: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: true,
      },
      except_condition_period: {
        type: Sequelize.ENUM('1st', '2nd', '3rd', '4th', '5th', 'last'),
        allowNull: true,
      },
      except_condition_day_of_week: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      except_condition_every: {
        type: Sequelize.ENUM('week', 'month'),
        allowNull: true,
      },
      except_job_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'SET NULL',
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
  },
};
