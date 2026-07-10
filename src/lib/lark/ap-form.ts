import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import { formatSupplierPaymentDetails } from "@/lib/procurement/supplier-po-notes";
import type { PurchaseOrder, Supplier } from "@/types/database";

/** Lark AP Form (应付单) widget IDs from approval definition. */
export const AP_FORM_WIDGETS = {
  apDate: "widget16487155523700001",
  brand: "widget17565218130340001",
  expenseCategory: "widget16487155616850001",
  paymentPlan: "widget16487155914750001",
  datePlanned: "widget16487156067450001",
  amountPlanned: "widget16487156073970001",
  planRemarks: "widget16487156087370001",
  owner: "widget16487156453330001",
  project: "widget16487157000480001",
  supplier: "widget16487157059830001",
  attachments: "widget16487157169580001",
  remarks: "widget16487157188410001",
} as const;

export const AP_FORM_BRANDS = [
  { value: "mexnqh4b-vy8o5l89xh7-0", text: "AERIS" },
  { value: "mexnqh4b-kvk28qgjh9i-0", text: "FTI" },
  { value: "mexnqh4b-acc3i46bfur-0", text: "BOTH" },
] as const;

export type ApBrandValue = (typeof AP_FORM_BRANDS)[number]["value"];

export const DEFAULT_AP_BRAND: ApBrandValue = "mexnqh4b-kvk28qgjh9i-0";

/** Official Lark Approval mini-program app id (international / Lark brand). */
export const LARK_APPROVAL_MINI_APP_ID = "cli_9c7cc8a9a9edd105";

/** Deep link that opens the approval instance detail in Lark. */
export function buildLarkApprovalDetailUrl(instanceCode: string): string {
  const code = instanceCode.trim();
  const path = `pc/pages/in-process/index?instanceId=${code}`;
  const params = new URLSearchParams({
    mode: "appCenter",
    appId: LARK_APPROVAL_MINI_APP_ID,
    path,
  });
  return `https://applink.larksuite.com/client/mini_program/open?${params.toString()}`;
}

export const LARK_APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELED",
  "DELETED",
] as const;

export type LarkApprovalStatus = (typeof LARK_APPROVAL_STATUSES)[number];

export function isLarkApprovalStatus(
  value: string | null | undefined,
): value is LarkApprovalStatus {
  return (
    !!value &&
    (LARK_APPROVAL_STATUSES as readonly string[]).includes(value)
  );
}

/** User-facing labels aligned with Lark AP Form UI. */
export function formatLarkApprovalStatus(
  status: string | null | undefined,
): string {
  switch (status) {
    case "PENDING":
      return "Under Review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "CANCELED":
      return "Recalled";
    case "DELETED":
      return "Deleted";
    default:
      return status?.trim() || "Not submitted";
  }
}

export function larkApprovalStatusBadgeClass(
  status: string | null | undefined,
): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "APPROVED":
      return "bg-emerald-50 text-emerald-900 border-emerald-200";
    case "REJECTED":
      return "bg-red-50 text-red-800 border-red-200";
    case "CANCELED":
      return "bg-stone-100 text-stone-600 border-stone-200";
    case "DELETED":
      return "bg-stone-100 text-stone-500 border-stone-200";
    default:
      return "bg-stone-50 text-stone-500 border-stone-200";
  }
}

export const AP_FORM_EXPENSE_CATEGORIES = [
  {
    value: "l1eqod7k-ihd29kb4fj-0",
    textZh: "员工借款",
    textEn: "Cash advance",
  },
  {
    value: "l1eqod7p-r2by1qduekk-1",
    textZh: "对公打款",
    textEn: "Corporate payment",
  },
  {
    value: "l1eqod7p-n95yh2hcb1n-3",
    textZh: "其他支出",
    textEn: "Other expenses",
  },
] as const;

export type ApExpenseCategoryValue =
  (typeof AP_FORM_EXPENSE_CATEGORIES)[number]["value"];

export const DEFAULT_AP_EXPENSE_CATEGORY: ApExpenseCategoryValue =
  "l1eqod7p-r2by1qduekk-1";

/** Amount widget on AP Form only allows these currencies. */
export const AP_FORM_CURRENCIES = ["IDR", "USD", "CNY"] as const;
export type ApFormCurrency = (typeof AP_FORM_CURRENCIES)[number];

/** Approval node that requires initiator-selected approver(s). */
export const AP_FORM_APPROVER_NODE_ID = "f05ce4c21a1b1cf610e474a641a05f3b";

type LarkFormControl = {
  id: string;
  type: string;
  value: unknown;
  currency?: string;
  open_ids?: string[];
};

function toRfc3339Date(ymd: string, timeZoneOffset = "+07:00"): string {
  return `${ymd}T00:00:00${timeZoneOffset}`;
}

function roundMoney(amount: number, currency: string): number {
  if (currency === "IDR") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

export function isApFormCurrency(
  currency: string,
): currency is ApFormCurrency {
  return (AP_FORM_CURRENCIES as readonly string[]).includes(currency);
}

export function isApExpenseCategoryValue(
  value: string,
): value is ApExpenseCategoryValue {
  return AP_FORM_EXPENSE_CATEGORIES.some((c) => c.value === value);
}

export function isApBrandValue(value: string): value is ApBrandValue {
  return AP_FORM_BRANDS.some((b) => b.value === value);
}

/** Local calendar date as YYYY-MM-DD. */
export function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dueDateYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return null;
}

export type BuildApFormInput = {
  po: PurchaseOrder;
  expenseCategory: ApExpenseCategoryValue;
  brand: ApBrandValue;
  /** AP date (应付日期) as YYYY-MM-DD. Defaults to today. */
  apDateYmd?: string | null;
  /** Lark open_id for Owner contact (optional). */
  ownerOpenId?: string | null;
  /** Optional Project textarea override (empty omits the widget). */
  project?: string | null;
  /** Optional Supplier textarea override (empty omits the widget). */
  supplier?: string | null;
  /** Optional general Remarks textarea (empty omits the widget). */
  remarks?: string | null;
  /**
   * Optional payment plan rows. When provided, used instead of auto-built rows.
   * planRemarks alone still applies when planRows is omitted.
   */
  planRows?: PaymentPlanRow[] | null;
  /**
   * Optional per-row Payment plan Remarks overrides (when planRows omitted).
   */
  planRemarks?: (string | null | undefined)[] | null;
  /** Lark attachment file codes from upload API. */
  attachmentCodes?: string[];
};

export type PaymentPlanRow = {
  dateYmd: string;
  amount: number;
  currency: ApFormCurrency;
  remarks: string;
};

export function defaultApProject(po: PurchaseOrder): string {
  if (po.pd_project_name?.trim()) {
    return [po.pd_project_product_name, po.pd_project_name]
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

export function defaultApSupplier(
  po: PurchaseOrder,
  supplier?: Supplier | null,
): string {
  if (supplier) {
    const details = formatSupplierPaymentDetails(supplier);
    if (details) return details;
  }
  return po.supplier_name?.trim() ?? "";
}

export function defaultApRemarks(po: PurchaseOrder): string {
  return [po.po_number ? `PO ${po.po_number}` : null, po.notes?.trim() || null]
    .filter(Boolean)
    .join("\n");
}

/** Product lines for payment-plan remarks: "Name (5,000 pcs), Other (1,000 pcs)". */
function formatPoLineItemsForRemarks(po: PurchaseOrder): string {
  const parts = (po.lines ?? [])
    .map((line) => {
      const name = line.sku_name?.trim();
      if (!name) return null;
      const qty = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
      }).format(Number(line.qty_ordered) || 0);
      return `${name} (${qty} pcs)`;
    })
    .filter((p): p is string => !!p);
  return parts.join(", ");
}

function buildPaymentPlanRemark(label: string, po: PurchaseOrder): string {
  const segments = [label];
  if (po.po_number?.trim()) {
    segments.push(`PO ${po.po_number.trim()}`);
  }
  const items = formatPoLineItemsForRemarks(po);
  if (items) segments.push(items);
  return segments.join(" - ");
}

export function buildPaymentPlanRows(po: PurchaseOrder): PaymentPlanRow[] {
  const currency = po.currency ?? "IDR";
  if (!isApFormCurrency(currency)) {
    throw new Error(
      `Lark AP Form does not support currency ${currency}. Use IDR, USD, or CNY.`,
    );
  }

  const totals = computePoInvoiceTotals(po);
  const today = localTodayYmd();
  const dpPct = totals.downPaymentPct;
  const dpDate = dueDateYmd(po.order_date) ?? today;
  const balanceDate = dueDateYmd(po.expected_date) ?? today;

  if (dpPct > 0 && dpPct < 100) {
    const balancePct = 100 - dpPct;
    return [
      {
        dateYmd: dpDate,
        amount: roundMoney(totals.downPayment, currency),
        currency,
        remarks: buildPaymentPlanRemark(`Down payment ${dpPct}%`, po),
      },
      {
        dateYmd: balanceDate,
        amount: roundMoney(totals.finalPayment, currency),
        currency,
        remarks: buildPaymentPlanRemark(`Balance ${balancePct}%`, po),
      },
    ];
  }

  return [
    {
      dateYmd: balanceDate,
      amount: roundMoney(totals.invoiceTotal, currency),
      currency,
      remarks: buildPaymentPlanRemark("Full payment", po),
    },
  ];
}

export function buildApFormControls(input: BuildApFormInput): LarkFormControl[] {
  const {
    po,
    expenseCategory,
    brand,
    apDateYmd,
    ownerOpenId,
    project,
    supplier,
    remarks,
    planRows: planRowsInput,
    planRemarks,
    attachmentCodes,
  } = input;

  const planRows = (planRowsInput ?? buildPaymentPlanRows(po)).map(
    (row, index) => {
      if (planRowsInput) return row;
      const override = planRemarks?.[index];
      if (typeof override === "string") {
        return { ...row, remarks: override.trim() };
      }
      return row;
    },
  );

  const apDate = dueDateYmd(apDateYmd) ?? localTodayYmd();

  const controls: LarkFormControl[] = [
    {
      id: AP_FORM_WIDGETS.apDate,
      type: "date",
      value: toRfc3339Date(apDate),
    },
    {
      id: AP_FORM_WIDGETS.brand,
      type: "radioV2",
      value: brand,
    },
    {
      id: AP_FORM_WIDGETS.expenseCategory,
      type: "radioV2",
      value: expenseCategory,
    },
    {
      id: AP_FORM_WIDGETS.paymentPlan,
      type: "fieldList",
      value: planRows.map((row) => [
        {
          id: AP_FORM_WIDGETS.datePlanned,
          type: "date",
          value: toRfc3339Date(row.dateYmd),
        },
        {
          id: AP_FORM_WIDGETS.amountPlanned,
          type: "amount",
          value: row.amount,
          currency: row.currency,
        },
        {
          id: AP_FORM_WIDGETS.planRemarks,
          type: "input",
          value: row.remarks,
        },
      ]),
    },
  ];

  if (ownerOpenId) {
    controls.push({
      id: AP_FORM_WIDGETS.owner,
      type: "contact",
      value: [],
      open_ids: [ownerOpenId],
    });
  }

  const projectValue =
    project !== undefined && project !== null
      ? project.trim()
      : defaultApProject(po);
  if (projectValue) {
    controls.push({
      id: AP_FORM_WIDGETS.project,
      type: "textarea",
      value: projectValue,
    });
  }

  const supplierValue =
    supplier !== undefined && supplier !== null
      ? supplier.trim()
      : defaultApSupplier(po);
  if (supplierValue) {
    controls.push({
      id: AP_FORM_WIDGETS.supplier,
      type: "textarea",
      value: supplierValue,
    });
  }

  if (attachmentCodes && attachmentCodes.length > 0) {
    controls.push({
      id: AP_FORM_WIDGETS.attachments,
      type: "attachmentV2",
      value: attachmentCodes,
    });
  }

  const remarksValue =
    remarks !== undefined && remarks !== null
      ? remarks.trim()
      : defaultApRemarks(po);
  if (remarksValue) {
    controls.push({
      id: AP_FORM_WIDGETS.remarks,
      type: "textarea",
      value: remarksValue,
    });
  }

  return controls;
}

export function stringifyApForm(controls: LarkFormControl[]): string {
  return JSON.stringify(controls);
}

/** Allowed email domains for the Lark user directory. */
export const LARK_DIRECTORY_EMAIL_DOMAINS = [
  "fromthisisland.com",
  "aerisbeaute.com",
] as const;

export function isLarkDirectoryEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return LARK_DIRECTORY_EMAIL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}
