export class InvoiceController {
  constructor({ invoiceService }) {
    this.invoiceService = invoiceService;
  }

  create = async (request, reply) => {
    const invoice = await this.invoiceService.generate(request.params.id, request.body);
    reply.code(201).send({ success: true, message: 'Invoice generated', data: invoice });
  };

  getById = async (request, reply) => {
    const invoice = await this.invoiceService.getById(request.params.id);
    reply.send({ success: true, message: 'Invoice retrieved', data: invoice });
  };

  listForJob = async (request, reply) => {
    const invoices = await this.invoiceService.listForJob(request.params.id);
    reply.send({ success: true, message: 'Invoices retrieved', data: invoices });
  };
}
