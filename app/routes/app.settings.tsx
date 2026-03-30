import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Checkbox,
  Button,
  Tabs,
  Select,
  Tag,
  Banner,
  ResourceList,
  ResourceItem,
  Modal,
  Divider,
  FormLayout,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { SHOPIFY_RETURN_REASONS } from "../types/returns";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, reasons] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.returnReason.findMany({
      where: { shop },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return json({ settings, reasons });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "save-general": {
      const returnWindowDays = parseInt(
        formData.get("returnWindowDays") as string,
        10
      );
      const requirePhotos = formData.get("requirePhotos") === "true";
      const maxPhotosPerItem = parseInt(
        formData.get("maxPhotosPerItem") as string,
        10
      );
      const returnInstructions = formData.get("returnInstructions") as string;

      await prisma.storeSettings.upsert({
        where: { shop },
        update: {
          returnWindowDays: returnWindowDays || 30,
          requirePhotos,
          maxPhotosPerItem: maxPhotosPerItem || 3,
          returnInstructions: returnInstructions || null,
        },
        create: {
          shop,
          returnWindowDays: returnWindowDays || 30,
          requirePhotos,
          maxPhotosPerItem: maxPhotosPerItem || 3,
          returnInstructions: returnInstructions || null,
        },
      });

      return json({ success: true, message: "General settings saved" });
    }

    case "save-eligibility": {
      const eligibleProductTags = formData.get("eligibleProductTags") as string;
      const excludedProductTags = formData.get("excludedProductTags") as string;

      await prisma.storeSettings.update({
        where: { shop },
        data: {
          eligibleProductTags: eligibleProductTags || null,
          excludedProductTags: excludedProductTags || null,
        },
      });

      return json({ success: true, message: "Eligibility settings saved" });
    }

    case "save-auto-approve": {
      const autoApproveEnabled = formData.get("autoApproveEnabled") === "true";
      const autoApproveMaxValue = formData.get("autoApproveMaxValue") as string;

      await prisma.storeSettings.update({
        where: { shop },
        data: {
          autoApproveEnabled,
          autoApproveMaxValue: autoApproveMaxValue
            ? parseFloat(autoApproveMaxValue)
            : null,
        },
      });

      return json({ success: true, message: "Auto-approve settings saved" });
    }

    case "save-notifications": {
      const notifyCustomerEmail =
        formData.get("notifyCustomerEmail") === "true";
      const notifyAdminEmail = formData.get("notifyAdminEmail") === "true";
      const adminEmailAddress = formData.get("adminEmailAddress") as string;
      const emailFromName = formData.get("emailFromName") as string;

      await prisma.storeSettings.update({
        where: { shop },
        data: {
          notifyCustomerEmail,
          notifyAdminEmail,
          adminEmailAddress: adminEmailAddress || null,
          emailFromName: emailFromName || null,
        },
      });

      return json({ success: true, message: "Notification settings saved" });
    }

    case "add-reason": {
      const label = formData.get("label") as string;
      const shopifyReason = formData.get("shopifyReason") as string;
      const requireNote = formData.get("requireNote") === "true";
      const requirePhoto = formData.get("requirePhoto") === "true";

      const maxOrder = await prisma.returnReason.findFirst({
        where: { shop },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      await prisma.returnReason.create({
        data: {
          shop,
          label,
          shopifyReason: shopifyReason || "OTHER",
          sortOrder: (maxOrder?.sortOrder || 0) + 1,
          requireNote,
          requirePhoto,
        },
      });

      return json({ success: true, message: "Reason added" });
    }

    case "delete-reason": {
      const reasonId = formData.get("reasonId") as string;
      await prisma.returnReason.delete({ where: { id: reasonId } });
      return json({ success: true, message: "Reason deleted" });
    }

    case "toggle-reason": {
      const reasonId = formData.get("reasonId") as string;
      const isActive = formData.get("isActive") === "true";
      await prisma.returnReason.update({
        where: { id: reasonId },
        data: { isActive },
      });
      return json({ success: true });
    }

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
};

export default function SettingsPage() {
  const { settings, reasons } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedTab, setSelectedTab] = useState(0);
  const [showAddReasonModal, setShowAddReasonModal] = useState(false);

  // General settings state
  const [returnWindowDays, setReturnWindowDays] = useState(
    String(settings?.returnWindowDays || 30)
  );
  const [requirePhotos, setRequirePhotos] = useState(
    settings?.requirePhotos || false
  );
  const [maxPhotosPerItem, setMaxPhotosPerItem] = useState(
    String(settings?.maxPhotosPerItem || 3)
  );
  const [returnInstructions, setReturnInstructions] = useState(
    settings?.returnInstructions || ""
  );

  // Eligibility state
  const [eligibleProductTags, setEligibleProductTags] = useState(
    settings?.eligibleProductTags || ""
  );
  const [excludedProductTags, setExcludedProductTags] = useState(
    settings?.excludedProductTags || ""
  );

  // Auto-approve state
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(
    settings?.autoApproveEnabled || false
  );
  const [autoApproveMaxValue, setAutoApproveMaxValue] = useState(
    String(settings?.autoApproveMaxValue || "")
  );

  // Notification state
  const [notifyCustomerEmail, setNotifyCustomerEmail] = useState(
    settings?.notifyCustomerEmail ?? true
  );
  const [notifyAdminEmail, setNotifyAdminEmail] = useState(
    settings?.notifyAdminEmail ?? true
  );
  const [adminEmailAddress, setAdminEmailAddress] = useState(
    settings?.adminEmailAddress || ""
  );
  const [emailFromName, setEmailFromName] = useState(
    settings?.emailFromName || ""
  );

  // New reason state
  const [newReasonLabel, setNewReasonLabel] = useState("");
  const [newReasonShopify, setNewReasonShopify] = useState("OTHER");
  const [newReasonRequireNote, setNewReasonRequireNote] = useState(false);
  const [newReasonRequirePhoto, setNewReasonRequirePhoto] = useState(false);

  const handleSubmit = useCallback(
    (intent: string, data: Record<string, string>) => {
      const formData = new FormData();
      formData.set("intent", intent);
      Object.entries(data).forEach(([key, value]) => {
        formData.set(key, value);
      });
      submit(formData, { method: "post" });
    },
    [submit]
  );

  const shopifyReasonOptions = SHOPIFY_RETURN_REASONS.map((r) => ({
    label: r.replace(/_/g, " "),
    value: r,
  }));

  const tabs = [
    { id: "general", content: "General" },
    { id: "eligibility", content: "Eligibility" },
    { id: "auto-approve", content: "Auto-Approve" },
    { id: "reasons", content: "Return Reasons" },
    { id: "notifications", content: "Notifications" },
  ];

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <Tabs
              tabs={tabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            >
              {/* General Tab */}
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      General Settings
                    </Text>
                    <FormLayout>
                      <TextField
                        label="Return Window (days after delivery)"
                        type="number"
                        value={returnWindowDays}
                        onChange={setReturnWindowDays}
                        helpText="How many days after delivery can customers request a return?"
                        autoComplete="off"
                      />
                      <Checkbox
                        label="Require photos from customers"
                        checked={requirePhotos}
                        onChange={setRequirePhotos}
                      />
                      {requirePhotos && (
                        <TextField
                          label="Max photos per item"
                          type="number"
                          value={maxPhotosPerItem}
                          onChange={setMaxPhotosPerItem}
                          autoComplete="off"
                        />
                      )}
                      <TextField
                        label="Return Instructions"
                        value={returnInstructions}
                        onChange={setReturnInstructions}
                        multiline={4}
                        autoComplete="off"
                        helpText="Instructions shown to customers after their return is approved."
                        placeholder="Please send the items to: [your address]..."
                      />
                    </FormLayout>
                    <Button
                      variant="primary"
                      loading={isSubmitting}
                      onClick={() =>
                        handleSubmit("save-general", {
                          returnWindowDays,
                          requirePhotos: String(requirePhotos),
                          maxPhotosPerItem,
                          returnInstructions,
                        })
                      }
                    >
                      Save General Settings
                    </Button>
                  </BlockStack>
                </Box>
              )}

              {/* Eligibility Tab */}
              {selectedTab === 1 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Product Eligibility
                    </Text>
                    <Banner tone="info">
                      Leave fields empty to allow returns for all products.
                    </Banner>
                    <FormLayout>
                      <TextField
                        label="Eligible Product Tags (comma-separated)"
                        value={eligibleProductTags}
                        onChange={setEligibleProductTags}
                        autoComplete="off"
                        helpText="Only products with these tags can be returned. Leave empty for all."
                        placeholder="returnable, clothing, accessories"
                      />
                      <TextField
                        label="Excluded Product Tags (comma-separated)"
                        value={excludedProductTags}
                        onChange={setExcludedProductTags}
                        autoComplete="off"
                        helpText="Products with these tags cannot be returned."
                        placeholder="final-sale, custom-order, perishable"
                      />
                    </FormLayout>
                    <Button
                      variant="primary"
                      loading={isSubmitting}
                      onClick={() =>
                        handleSubmit("save-eligibility", {
                          eligibleProductTags,
                          excludedProductTags,
                        })
                      }
                    >
                      Save Eligibility Settings
                    </Button>
                  </BlockStack>
                </Box>
              )}

              {/* Auto-Approve Tab */}
              {selectedTab === 2 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Auto-Approve Rules
                    </Text>
                    <Checkbox
                      label="Enable auto-approval"
                      checked={autoApproveEnabled}
                      onChange={setAutoApproveEnabled}
                      helpText="Automatically approve return requests that match the criteria below."
                    />
                    {autoApproveEnabled && (
                      <TextField
                        label="Max order value for auto-approval"
                        type="number"
                        value={autoApproveMaxValue}
                        onChange={setAutoApproveMaxValue}
                        autoComplete="off"
                        helpText="Returns with total value below this amount will be auto-approved. Leave empty for no limit."
                        prefix="€"
                      />
                    )}
                    <Button
                      variant="primary"
                      loading={isSubmitting}
                      onClick={() =>
                        handleSubmit("save-auto-approve", {
                          autoApproveEnabled: String(autoApproveEnabled),
                          autoApproveMaxValue,
                        })
                      }
                    >
                      Save Auto-Approve Settings
                    </Button>
                  </BlockStack>
                </Box>
              )}

              {/* Return Reasons Tab */}
              {selectedTab === 3 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingMd">
                        Return Reasons
                      </Text>
                      <Button
                        onClick={() => setShowAddReasonModal(true)}
                      >
                        Add Reason
                      </Button>
                    </InlineStack>
                    <ResourceList
                      items={reasons}
                      renderItem={(reason) => (
                        <ResourceItem
                          id={reason.id}
                          accessibilityLabel={reason.label}
                        >
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <BlockStack gap="050">
                              <Text
                                as="span"
                                variant="bodyMd"
                                fontWeight="bold"
                              >
                                {reason.label}
                              </Text>
                              <InlineStack gap="100">
                                <Tag>{reason.shopifyReason}</Tag>
                                {reason.requireNote && <Tag>Note required</Tag>}
                                {reason.requirePhoto && (
                                  <Tag>Photo required</Tag>
                                )}
                                {!reason.isActive && (
                                  <Badge tone="critical">Inactive</Badge>
                                )}
                              </InlineStack>
                            </BlockStack>
                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                onClick={() => {
                                  const formData = new FormData();
                                  formData.set("intent", "toggle-reason");
                                  formData.set("reasonId", reason.id);
                                  formData.set(
                                    "isActive",
                                    String(!reason.isActive)
                                  );
                                  submit(formData, { method: "post" });
                                }}
                              >
                                {reason.isActive ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                size="slim"
                                tone="critical"
                                onClick={() => {
                                  const formData = new FormData();
                                  formData.set("intent", "delete-reason");
                                  formData.set("reasonId", reason.id);
                                  submit(formData, { method: "post" });
                                }}
                              >
                                Delete
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </ResourceItem>
                      )}
                    />
                  </BlockStack>
                </Box>
              )}

              {/* Notifications Tab */}
              {selectedTab === 4 && (
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Email Notifications
                    </Text>
                    <FormLayout>
                      <Checkbox
                        label="Send email notifications to customers"
                        checked={notifyCustomerEmail}
                        onChange={setNotifyCustomerEmail}
                        helpText="Customers will receive emails when their return status changes."
                      />
                      <Divider />
                      <Checkbox
                        label="Send email notifications to admin"
                        checked={notifyAdminEmail}
                        onChange={setNotifyAdminEmail}
                        helpText="You will receive an email when a new return is requested."
                      />
                      {notifyAdminEmail && (
                        <TextField
                          label="Admin Email Address"
                          type="email"
                          value={adminEmailAddress}
                          onChange={setAdminEmailAddress}
                          autoComplete="off"
                          placeholder="admin@yourstore.com"
                        />
                      )}
                      <Divider />
                      <TextField
                        label="Email 'From' Name"
                        value={emailFromName}
                        onChange={setEmailFromName}
                        autoComplete="off"
                        placeholder="Your Store Name"
                        helpText="The sender name that appears in email notifications."
                      />
                    </FormLayout>
                    <Button
                      variant="primary"
                      loading={isSubmitting}
                      onClick={() =>
                        handleSubmit("save-notifications", {
                          notifyCustomerEmail: String(notifyCustomerEmail),
                          notifyAdminEmail: String(notifyAdminEmail),
                          adminEmailAddress,
                          emailFromName,
                        })
                      }
                    >
                      Save Notification Settings
                    </Button>
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Add Reason Modal */}
      {showAddReasonModal && (
        <Modal
          open={showAddReasonModal}
          onClose={() => setShowAddReasonModal(false)}
          title="Add Return Reason"
          primaryAction={{
            content: "Add",
            loading: isSubmitting,
            onAction: () => {
              handleSubmit("add-reason", {
                label: newReasonLabel,
                shopifyReason: newReasonShopify,
                requireNote: String(newReasonRequireNote),
                requirePhoto: String(newReasonRequirePhoto),
              });
              setShowAddReasonModal(false);
              setNewReasonLabel("");
              setNewReasonShopify("OTHER");
              setNewReasonRequireNote(false);
              setNewReasonRequirePhoto(false);
            },
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowAddReasonModal(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Reason Label"
                value={newReasonLabel}
                onChange={setNewReasonLabel}
                autoComplete="off"
                placeholder="e.g. Defective product"
              />
              <Select
                label="Shopify Return Reason"
                options={shopifyReasonOptions}
                value={newReasonShopify}
                onChange={setNewReasonShopify}
                helpText="Maps to Shopify's built-in return reason categories."
              />
              <Checkbox
                label="Require customer to add a note"
                checked={newReasonRequireNote}
                onChange={setNewReasonRequireNote}
              />
              <Checkbox
                label="Require customer to upload a photo"
                checked={newReasonRequirePhoto}
                onChange={setNewReasonRequirePhoto}
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
