import { DataTypes, Model } from 'sequelize';
import { sequelize } from '#common/database.js';
import { Customer } from '#models/customer.model.js';
import { Location } from '#models/location.model.js';
import { ServiceType } from '#models/service-type.model.js';
import { Job } from '#models/job.model.js';
import { CustomerLineItem } from '#models/customer-line-item.model.js';

export const DOCUMENT_TYPES = ['estimate', 'invoice'];
export const ESTIMATE_STATUSES = ['draft', 'sent', 'approved', 'declined'];
export const INVOICE_STATUSES = ['draft', 'sent', 'paid'];

/**
 * Estimates and invoices in one table, discriminated by `type` - see
 * docs/adr/0001-customer-documents.md. DB CHECK constraints enforce the per-type rules:
 * - invoice: jobId, jobSnapshot and occurrenceDate are required.
 * - estimate: occurrenceDate is always null; jobId + jobSnapshot are set together,
 *   only once the estimate is approved and converted into a job.
 * Always access it through a type-scoped repository (EstimateRepository / InvoiceRepository).
 */
export class CustomerDocument extends Model {}

CustomerDocument.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM(...DOCUMENT_TYPES),
      allowNull: false,
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'customer_id',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'location_id',
    },
    serviceTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'service_type_id',
    },
    status: {
      type: DataTypes.ENUM(...new Set([...ESTIMATE_STATUSES, ...INVOICE_STATUSES])),
      allowNull: false,
      defaultValue: 'draft',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'job_id',
    },
    jobSnapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'job_snapshot',
    },
    occurrenceDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'occurrence_date',
    },
  },
  {
    sequelize,
    modelName: 'CustomerDocument',
    tableName: 'customer_documents',
    underscored: true,
  },
);

CustomerDocument.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
CustomerDocument.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });
CustomerDocument.belongsTo(ServiceType, { foreignKey: 'serviceTypeId', as: 'serviceType' });
CustomerDocument.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
CustomerDocument.hasMany(CustomerLineItem, { foreignKey: 'parentId', as: 'lineItems' });
