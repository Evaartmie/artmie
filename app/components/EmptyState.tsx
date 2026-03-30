import { EmptyState as PolarisEmptyState } from "@shopify/polaris";

interface ReturnEmptyStateProps {
  heading?: string;
  body?: string;
  action?: {
    content: string;
    url: string;
  };
}

export function ReturnEmptyState({
  heading = "No returns yet",
  body = "When customers request returns, they will appear here.",
  action,
}: ReturnEmptyStateProps) {
  return (
    <PolarisEmptyState
      heading={heading}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      action={action}
    >
      <p>{body}</p>
    </PolarisEmptyState>
  );
}
