import { Page, Card, Text, BlockStack } from "@shopify/polaris";

export default function TestPage() {
  return (
    <Page title="Test Page">
      <Card>
        <BlockStack gap="300">
          <Text as="h1" variant="headingXl">
            Returns Manager funguje!
          </Text>
          <Text as="p">
            Ak vidíš túto stránku, rendering je OK.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
