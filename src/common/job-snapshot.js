// The job's details frozen onto a customer document (an invoice when it is generated, an
// estimate when it is converted), so later edits to the job don't rewrite the document.
export function buildJobSnapshot(job) {
  return {
    customerId: job.customerId,
    customerName: job.customer?.name,
    locationId: job.locationId,
    locationAddress: job.location?.addressLine1,
    serviceTypeId: job.serviceTypeId,
    serviceTypeName: job.serviceType?.name,
    date: job.date,
    startTime: job.startTime,
    lengthMinutes: job.lengthMinutes,
  };
}
