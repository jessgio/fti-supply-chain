import { Badge } from "@/components/ui/badge";
import {
  formatLarkApprovalStatus,
  larkApprovalStatusBadgeClass,
} from "@/lib/lark/ap-form";
import type { PoApFormView } from "@/lib/procurement/po-search-results";

function paymentScopeLabel(scope: PoApFormView["paymentScope"]): string {
  switch (scope) {
    case "down_payment":
      return "Down payment";
    case "balance":
      return "Balance";
    case "both":
      return "Down payment + balance";
    default:
      return "Payment";
  }
}

/** Every linked AP Form on a purchase order, with its Lark approval status. */
export function PoApFormStatusList({ forms }: { forms: PoApFormView[] }) {
  if (forms.length === 0) {
    return <span className="text-xs text-stone-400">Not submitted</span>;
  }

  const showScope = forms.length > 1;
  return (
    <ul className="min-w-[8.5rem] space-y-2">
      {forms.map((form) => (
        <li key={form.id} className="space-y-0.5">
          <p className="font-mono text-[11px] leading-tight text-stone-700">
            {form.serialNumber ? `AP ${form.serialNumber}` : "AP form"}
          </p>
          <Badge
            className={`border ${larkApprovalStatusBadgeClass(form.status)}`}
          >
            {formatLarkApprovalStatus(form.status)}
          </Badge>
          {showScope ? (
            <p className="text-[10px] leading-tight text-stone-500">
              {paymentScopeLabel(form.paymentScope)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
