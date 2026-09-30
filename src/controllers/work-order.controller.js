export class WorkOrderController {
  constructor({ workOrderService }) {
    this.workOrderService = workOrderService;
  }

  create = async (request, reply) => {
    const workOrder = await this.workOrderService.create(request.params.id, request.body);
    reply.code(201).send({ success: true, message: 'Work order created', data: workOrder });
  };

  getById = async (request, reply) => {
    const workOrder = await this.workOrderService.getById(request.params.id);
    reply.send({ success: true, message: 'Work order retrieved', data: workOrder });
  };

  updateStatus = async (request, reply) => {
    const workOrder = await this.workOrderService.updateStatus(
      request.params.id,
      request.body.status,
    );
    reply.send({ success: true, message: 'Work order status updated', data: workOrder });
  };

  updateTask = async (request, reply) => {
    const workOrder = await this.workOrderService.updateTask(
      request.params.id,
      request.params.taskId,
      request.body.isDone,
    );
    reply.send({ success: true, message: 'Work order task updated', data: workOrder });
  };

  listForJob = async (request, reply) => {
    const workOrders = await this.workOrderService.listForJob(request.params.id);
    reply.send({ success: true, message: 'Work orders retrieved', data: workOrders });
  };
}
