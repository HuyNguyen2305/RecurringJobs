'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('jobs', 'recurrence_rule_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('jobs', 'recurrence_rule_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'recurrence_rules', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('jobs', ['recurrence_rule_id']);
  },
};
