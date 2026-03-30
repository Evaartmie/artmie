import { Badge } from "@shopify/polaris";
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_COLORS,
} from "../types/returns";
import type { ReturnStatus } from "../types/returns";

interface ReturnStatusBadgeProps {
  status: string;
}

export function ReturnStatusBadge({ status }: ReturnStatusBadgeProps) {
  const typedStatus = status as ReturnStatus;
  return (
    <Badge tone={RETURN_STATUS_COLORS[typedStatus] || "new"}>
      {RETURN_STATUS_LABELS[typedStatus] || status}
    </Badge>
  );
}
