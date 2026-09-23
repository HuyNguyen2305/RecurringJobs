import { CONTROLLER_KEYS } from '#constants/singleton.js';
import {
  createInvoiceSchema,
  getInvoiceSchema,
  listJobInvoicesSchema,
} from '#schemas/invoice.schema.js';

export default async function invoiceRouter(fastify) {
  const controller = fastify.container.resolve(CONTROLLER_KEYS.INVOICE);

  fastify.post('/jobs/:id/invoices', { schema: createInvoiceSchema }, controller.create);
  fastify.get('/jobs/:id/invoices', { schema: listJobInvoicesSchema }, controller.listForJob);
  fastify.get('/invoices/:id', { schema: getInvoiceSchema }, controller.getById);
}
