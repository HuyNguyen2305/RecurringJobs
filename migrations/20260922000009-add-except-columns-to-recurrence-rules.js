'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('recurrence_rules', 'except_type', {
      type: Sequelize.ENUM('off', 'month', 'condition', 'frequency'),
      allowNull: false,
      defaultValue: 'off',
    });
    await queryInterface.addColumn('recurrence_rules', 'except_months', {
      type: Sequelize.ARRAY(Sequelize.INTEGER),
      allowNull: true,
    });
    await queryInterface.addColumn('recurrence_rules', 'except_condition_period', {
      type: Sequelize.ENUM('1st', '2nd', '3rd', '4th', '5th', 'last'),
      allowNull: true,
    });
    await queryInterface.addColumn('recurrence_rules', 'except_condition_day_of_week', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('recurrence_rules', 'except_condition_every', {
      type: Sequelize.ENUM('week', 'month'),
      allowNull: true,
    });
    await queryInterface.addColumn('recurrence_rules', 'except_job_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'jobs', key: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('recurrence_rules', ['except_job_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('recurrence_rules', 'except_job_id');
    await queryInterface.removeColumn('recurrence_rules', 'except_condition_every');
    await queryInterface.removeColumn('recurrence_rules', 'except_condition_day_of_week');
    await queryInterface.removeColumn('recurrence_rules', 'except_condition_period');
    await queryInterface.removeColumn('recurrence_rules', 'except_months');
    await queryInterface.removeColumn('recurrence_rules', 'except_type');

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
};
