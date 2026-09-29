# ADR 0001: Estimates and invoices share one `customer_documents` table

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

The codebase follows one model per table. Estimates (priced quotes that can be converted into a job) and invoices (bills for one job occurrence) grew into near-identical "customer documents". Both have a customer, location, service type, status, notes, a job link, a job snapshot and priced line items. With two tables we'd have needed two line-item tables too, or a line-item table whose `parent_id` could reference either table and so had no foreign key.

## Decision

Both concepts live in **one table, `customer_documents`**, with a `type` discriminator (`'estimate' | 'invoice'`). Line items live in **`customer_line_items`**, whose `parent_id` is a real FK to `customer_documents(id)` with `ON DELETE CASCADE`. There is no `parent_type` column, because the parent's `type` already says which kind a line item belongs to.

This is a one-off exception to one-model-per-table, not a new default.

### Columns

| Column                                                         | Estimate                                                                   | Invoice                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `id`, `type`, `created_at`, `updated_at`                       | ✓                                                                          | ✓                                                       |
| `customer_id`, `location_id`, `service_type_id` (NOT NULL FKs) | ✓                                                                          | ✓, copied from the job                                  |
| `status`                                                       | `draft` → `sent` → `approved` / `declined`                                 | `draft` / `sent` / `paid`                               |
| `notes`                                                        | optional                                                                   | optional                                                |
| `job_id`, `job_snapshot`                                       | NULL until converted, then the job it became and its details at conversion | required: the invoiced job and its details at invoicing |
| `occurrence_date`                                              | always NULL                                                                | required                                                |

Totals are not stored. They are computed from the line items in integer cents.

### Rules enforced by the database

- `customer_documents_type_fields_check`:
  - **Invoices** must have `job_id`, `job_snapshot` and `occurrence_date` set.
  - **Estimates** never have `occurrence_date`.
  - On estimates, `job_id` and `job_snapshot` are either both NULL or both set, and `job_id` may be set only when `status = 'approved'`.
- `customer_documents_status_check`: only the statuses valid for the document's type are allowed.
- `customer_documents_invoice_occurrence_unique`: at most one invoice per (`job_id`, `occurrence_date`).
- `customer_documents_estimate_job_unique`: a job can be linked to at most one estimate.
- `job_id` references `jobs` with `ON DELETE RESTRICT`. A job can't be deleted while an invoice or converted estimate points at it, since either would break the rules above.

### Access rule

Never query `CustomerDocument` directly. Go through the type-scoped repositories, `EstimateRepository` and `InvoiceRepository`, which both extend `CustomerDocumentRepository`. They pin every read and write to one `type`, so an estimate id can never be read or changed through the invoice API, and vice versa.

## Consequences

- **One table and one line-item FK** replace two tables and a line-item parent with no integrity guarantee.
- **Per-type columns are nullable.** The CHECK constraints, not the column definitions, carry the per-type rules.
- **`status` is one enum shared by both types.** Validity per type is enforced by `customer_documents_status_check` and the service logic.
- **Invoices copy `customer_id`, `location_id` and `service_type_id` from their job** when they are created.
- **Invoice API change:** invoices moved from a single `amount` to `lineItems`. `POST /jobs/:id/invoices` requires `lineItems`, and responses return `lineItems` and `total`. Invoices that existed before the migration (`20260928000003`) were moved with their ids unchanged. Each got one line item, `"Invoice amount"`, with quantity 1 and unit price equal to its old amount.
