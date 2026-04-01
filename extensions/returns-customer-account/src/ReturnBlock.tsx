import {
  reactExtension,
  Text,
  Banner,
  BlockStack,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.order-status.cart-line-list.render-after",
  () => (
    <BlockStack spacing="base">
      <Banner status="info">TEST - Artmie Returns Manager extension funguje!</Banner>
    </BlockStack>
  )
);
