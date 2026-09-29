'use strict';

// Estimates and invoices share one table, discriminated by `type` - see
// docs/adr/0001-customer-documents.md. CHECK constraints enforce which columns each type must fill.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'customer_documents',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          type: {
            type: Sequelize.ENUM('estimate', 'invoice'),
            allowNull: false,
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
          status: {
            type: Sequelize.ENUM('draft', 'sent', 'approved', 'declined', 'paid'),
            allowNull: false,
            defaultValue: 'draft',
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          // RESTRICT: neither an invoice nor a converted estimate may lose its job.
          job_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'jobs', key: 'id' },
            onDelete: 'RESTRICT',
          },
          job_snapshot: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          occurrence_date: {
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

      await queryInterface.addIndex('customer_documents', ['customer_id'], { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE customer_documents ADD CONSTRAINT customer_documents_type_fields_check CHECK (
           (type = 'invoice'
             AND job_id IS NOT NULL AND job_snapshot IS NOT NULL AND occurrence_date IS NOT NULL)
           OR (type = 'estimate'
             AND occurrence_date IS NULL
             AND (job_id IS NULL) = (job_snapshot IS NULL)
             AND (job_id IS NULL OR status = 'approved'))
         );

         ALTER TABLE customer_documents ADD CONSTRAINT customer_documents_status_check CHECK (
           (type = 'estimate' AND status IN ('draft', 'sent', 'approved', 'declined'))
           OR (type = 'invoice' AND status IN ('draft', 'sent', 'paid'))
         );

         CREATE UNIQUE INDEX customer_documents_invoice_occurrence_unique
           ON customer_documents (job_id, occurrence_date) WHERE type = 'invoice';

         CREATE UNIQUE INDEX customer_documents_estimate_job_unique
           ON customer_documents (job_id) WHERE type = 'estimate';`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customer_documents');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_customer_documents_type"; DROP TYPE IF EXISTS "enum_customer_documents_status";',
    );
  },
};
