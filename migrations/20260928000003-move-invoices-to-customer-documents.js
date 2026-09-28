'use strict';

const createInvoices = require('./20260923000001-create-invoices.js');

// Moves every invoice into customer_documents (same id, so existing /invoices/:id links
// keep working) and turns its single `amount` into one line item.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `INSERT INTO customer_documents
           (id, type, customer_id, location_id, service_type_id, status,
            job_id, job_snapshot, occurrence_date, created_at, updated_at)
         SELECT i.id, 'invoice', j.customer_id, j.location_id, j.service_type_id,
                i.status::text::"enum_customer_documents_status",
                i.job_id, i.job_snapshot, i.occurrence_date, i.created_at, i.updated_at
         FROM invoices i
         JOIN jobs j ON j.id = i.job_id;

         INSERT INTO customer_line_items
           (id, parent_id, description, quantity, unit_price, position, created_at, updated_at)
         SELECT gen_random_uuid(), i.id, 'Invoice amount', 1, i.amount, 0, i.created_at, i.updated_at
         FROM invoices i;

         DROP TABLE invoices;
         DROP TYPE IF EXISTS "enum_invoices_status";`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await createInvoices.up(queryInterface, Sequelize);

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `INSERT INTO invoices
           (id, job_id, occurrence_date, amount, status, job_snapshot, created_at, updated_at)
         SELECT d.id, d.job_id, d.occurrence_date,
                COALESCE((SELECT SUM(ROUND(li.quantity * li.unit_price, 2))
                          FROM customer_line_items li
                          WHERE li.parent_id = d.id), 0),
                d.status::text::"enum_invoices_status",
                d.job_snapshot, d.created_at, d.updated_at
         FROM customer_documents d
         WHERE d.type = 'invoice';

         DELETE FROM customer_documents WHERE type = 'invoice';`,
        { transaction },
      );
    });
  },
};
