export const PO_PAYMENT_PURPOSES = [
  "Down payment",
  "Balance payment",
  "Shipping",
  "Fee",
  "Tax",
  "Other",
] as const;

export type PoPaymentPurpose = (typeof PO_PAYMENT_PURPOSES)[number];
