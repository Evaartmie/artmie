import {
  reactExtension,
  Text,
  BlockStack,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.order.action.render",
  () => (
    <BlockStack>
      <Text>✅ Naša extension funguje! Tu bude formulár na vrátenie.</Text>
    </BlockStack>
  )
);
