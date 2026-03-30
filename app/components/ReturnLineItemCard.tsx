import { InlineStack, BlockStack, Text, Thumbnail } from "@shopify/polaris";

interface ReturnLineItemCardProps {
  productTitle: string;
  variantTitle?: string | null;
  sku?: string | null;
  quantity: number;
  pricePerItem: number;
  currency: string;
  reasonLabel?: string | null;
  customerNote?: string | null;
  imageUrl?: string | null;
}

export function ReturnLineItemCard({
  productTitle,
  variantTitle,
  sku,
  quantity,
  pricePerItem,
  currency,
  reasonLabel,
  customerNote,
  imageUrl,
}: ReturnLineItemCardProps) {
  return (
    <InlineStack gap="300" blockAlign="start" wrap={false}>
      {imageUrl && (
        <Thumbnail source={imageUrl} alt={productTitle} size="medium" />
      )}
      <BlockStack gap="100">
        <Text as="span" variant="bodyMd" fontWeight="bold">
          {productTitle}
        </Text>
        {variantTitle && (
          <Text as="span" variant="bodySm" tone="subdued">
            {variantTitle}
          </Text>
        )}
        {sku && (
          <Text as="span" variant="bodySm" tone="subdued">
            SKU: {sku}
          </Text>
        )}
        {reasonLabel && (
          <Text as="span" variant="bodySm">
            Reason: {reasonLabel}
          </Text>
        )}
        {customerNote && (
          <Text as="span" variant="bodySm" tone="subdued">
            Note: {customerNote}
          </Text>
        )}
      </BlockStack>
      <BlockStack gap="100" align="end">
        <Text as="span" variant="bodySm">
          Qty: {quantity}
        </Text>
        <Text as="span" variant="bodyMd" fontWeight="bold">
          {(pricePerItem * quantity).toFixed(2)} {currency}
        </Text>
      </BlockStack>
    </InlineStack>
  );
}
