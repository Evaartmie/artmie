import { BlockStack, InlineStack, Text, Divider } from "@shopify/polaris";
import { ReturnStatusBadge } from "./ReturnStatusBadge";

interface TimelineEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
  note: string | null;
  createdAt: string;
}

interface ReturnTimelineProps {
  entries: TimelineEntry[];
}

export function ReturnTimeline({ entries }: ReturnTimelineProps) {
  if (entries.length === 0) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        No status changes recorded yet.
      </Text>
    );
  }

  return (
    <BlockStack gap="300">
      {entries.map((entry) => (
        <div key={entry.id}>
          <InlineStack gap="200" blockAlign="start">
            <div style={{ minWidth: "120px" }}>
              <Text as="span" variant="bodySm" tone="subdued">
                {new Date(entry.createdAt).toLocaleString()}
              </Text>
            </div>
            <BlockStack gap="050">
              <InlineStack gap="100">
                {entry.fromStatus && (
                  <>
                    <ReturnStatusBadge status={entry.fromStatus} />
                    <Text as="span" variant="bodySm">
                      →
                    </Text>
                  </>
                )}
                <ReturnStatusBadge status={entry.toStatus} />
              </InlineStack>
              {entry.note && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {entry.note}
                </Text>
              )}
              {entry.changedBy && (
                <Text as="span" variant="bodySm" tone="subdued">
                  by {entry.changedBy}
                </Text>
              )}
            </BlockStack>
          </InlineStack>
          <Divider />
        </div>
      ))}
    </BlockStack>
  );
}
