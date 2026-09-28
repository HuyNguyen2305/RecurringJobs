import { ValidationError } from '#common/error.js';
import { hasAtMostTwoDecimals, lineTotalCents, centsToString, toCents } from '#common/money.js';

// Shared by estimates and invoices: both are priced by line items.
export function validateLineItems(lineItems) {
  lineItems.forEach((item, index) => {
    if (!(item.quantity > 0)) {
      throw new ValidationError(`lineItems[${index}].quantity must be greater than 0`);
    }
    if (!hasAtMostTwoDecimals(item.quantity) || !hasAtMostTwoDecimals(item.unitPrice)) {
      throw new ValidationError(
        `lineItems[${index}] quantity and unitPrice cannot have more than 2 decimal places`,
      );
    }
  });
}

// Rows for customer_line_items, positioned in the order the client sent them.
export function toLineItemRows(parentId, lineItems) {
  return lineItems.map((item, position) => ({
    parentId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    position,
  }));
}

// Formats stored rows and computes each line total and the document total exactly in cents.
export function summarizeLineItems(rows) {
  let totalCents = 0n;
  const lineItems = rows.map((row) => {
    const cents = lineTotalCents(row.quantity, row.unitPrice);
    totalCents += cents;
    return {
      id: row.id,
      description: row.description,
      quantity: centsToString(toCents(row.quantity)),
      unitPrice: centsToString(toCents(row.unitPrice)),
      position: row.position,
      lineTotal: centsToString(cents),
    };
  });
  return { lineItems, total: centsToString(totalCents) };
}
