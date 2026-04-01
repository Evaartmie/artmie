import {
  reactExtension,
  CustomerAccountAction,
  useApi,
  useOrder,
  useTranslate,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Select,
  TextField,
  Divider,
  Banner,
  Checkbox,
  Heading,
  View,
  Badge,
  Image,
} from "@shopify/ui-extensions-react/customer-account";
import { useState, useEffect, useCallback } from "react";

export default reactExtension(
  "customer-account.order.action.render",
  () => <ReturnRequestPage />
);

interface LineItemForReturn {
  id: string;
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  price: number;
  currency: string;
  imageUrl?: string;
  variantId?: string;
  selected: boolean;
  returnQuantity: number;
  reasonId: string;
  note: string;
}

interface ReturnReason {
  id: string;
  label: string;
  requireNote: boolean;
  requirePhoto: boolean;
}

interface StoreSettings {
  returnWindowDays: number;
  requirePhotos: boolean;
  returnInstructions: string;
}

function ReturnRequestPage() {
  const { sessionToken, shop, extension } = useApi<"customer-account.order.action.render">();
  const order = useOrder();
  const translate = useTranslate();

  const [step, setStep] = useState<"loading" | "ineligible" | "form" | "submitting" | "success" | "error">("loading");
  const [items, setItems] = useState<LineItemForReturn[]>([]);
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerIban, setCustomerIban] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ineligibleReason, setIneligibleReason] = useState("");

  const appUrl = extension?.scriptUrl
    ? new URL(extension.scriptUrl).origin
    : "";

  const shopDomain = shop?.myshopifyDomain || shop?.domain || "";

  // Fetch data on load
  useEffect(() => {
    async function init() {
      if (!order || !shopDomain) {
        setStep("loading");
        return;
      }

      try {
        const token = await sessionToken.get();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        };

        // 1. Check eligibility
        const eligParams = new URLSearchParams({
          shop: shopDomain,
          orderId: order.id,
        });

        if (order.fulfillments?.[0]?.createdAt) {
          eligParams.set("deliveredAt", order.fulfillments[0].createdAt);
        }

        const eligResponse = await fetch(
          `${appUrl}/api/eligibility?${eligParams}`,
          { headers }
        );
        const eligData = await eligResponse.json();

        if (!eligData.eligible) {
          setIneligibleReason(eligData.reason || translate("error.windowExpired"));
          setStep("ineligible");
          return;
        }

        // 2. Get store settings
        const settingsResponse = await fetch(
          `${appUrl}/api/settings?shop=${shopDomain}`,
          { headers }
        );
        const settingsData = await settingsResponse.json();
        if (settingsData.settings) {
          setSettings(settingsData.settings);
        }

        // 3. Get return reasons
        const reasonsResponse = await fetch(
          `${appUrl}/api/reasons?shop=${shopDomain}`,
          { headers }
        );
        const reasonsData = await reasonsResponse.json();
        setReasons(reasonsData.reasons || []);

        // 4. Map order line items
        const lineItems: LineItemForReturn[] = (order.lineItems || []).map((item: any) => ({
          id: item.id,
          title: item.title || "",
          variantTitle: item.variantTitle || "",
          sku: item.sku || "",
          quantity: item.quantity || 1,
          price: parseFloat(item.price?.amount || "0"),
          currency: item.price?.currencyCode || "EUR",
          imageUrl: item.image?.url,
          variantId: item.variantId,
          selected: false,
          returnQuantity: 1,
          reasonId: "",
          note: "",
        }));

        setItems(lineItems);
        setStep("form");
      } catch (err) {
        console.error("Failed to initialize return form:", err);
        setErrorMessage(translate("error.generic"));
        setStep("error");
      }
    }

    init();
  }, [order, shopDomain]);

  const handleItemToggle = useCallback((itemId: string, checked: boolean) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, selected: checked } : item
      )
    );
  }, []);

  const handleQuantityChange = useCallback((itemId: string, qty: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, returnQuantity: Math.min(parseInt(qty) || 1, item.quantity) }
          : item
      )
    );
  }, []);

  const handleReasonChange = useCallback((itemId: string, reasonId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, reasonId } : item
      )
    );
  }, []);

  const handleNoteChange = useCallback((itemId: string, note: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, note } : item
      )
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    const selectedItems = items.filter((item) => item.selected);

    if (selectedItems.length === 0) {
      setErrorMessage(translate("returnForm.errorSelectItem"));
      return;
    }

    const missingReason = selectedItems.find((item) => !item.reasonId);
    if (missingReason) {
      setErrorMessage(translate("returnForm.errorSelectReason"));
      return;
    }

    // Check if notes are required for reasons that need them
    for (const item of selectedItems) {
      const reason = reasons.find((r) => r.id === item.reasonId);
      if (reason?.requireNote && !item.note.trim()) {
        setErrorMessage(`${item.title}: ${translate("returnForm.detailsRequired")}`);
        return;
      }
    }

    setStep("submitting");
    setErrorMessage("");

    try {
      const token = await sessionToken.get();

      const totalRefund = selectedItems.reduce(
        (sum, item) => sum + item.price * item.returnQuantity,
        0
      );

      const response = await fetch(`${appUrl}/api/returns/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          shop: shopDomain,
          orderId: order!.id,
          orderName: order!.name || order!.id,
          customerId: order!.customer?.id || "",
          customerEmail: order!.customer?.email || "",
          customerName: order!.customer?.displayName || "",
          currency: selectedItems[0]?.currency || "EUR",
          customerNotes: customerNotes || undefined,
          customerIban: customerIban || undefined,
          totalRefundAmount: totalRefund,
          lineItems: selectedItems.map((item) => ({
            lineItemId: item.id,
            variantId: item.variantId,
            productTitle: item.title,
            variantTitle: item.variantTitle,
            sku: item.sku,
            quantity: item.returnQuantity,
            pricePerItem: item.price,
            reasonId: item.reasonId,
            customerNote: item.note || undefined,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || translate("error.generic"));
      }

      setStep("success");
    } catch (err: any) {
      setErrorMessage(err.message || translate("error.generic"));
      setStep("form");
    }
  }, [items, customerNotes, customerIban, reasons, order, shopDomain]);

  // Loading state
  if (step === "loading") {
    return (
      <CustomerAccountAction title={translate("returnForm.title")}>
        <BlockStack spacing="base">
          <Text>{translate("returnForm.submitting")}...</Text>
        </BlockStack>
      </CustomerAccountAction>
    );
  }

  // Ineligible state
  if (step === "ineligible") {
    return (
      <CustomerAccountAction title={translate("returnForm.title")}>
        <BlockStack spacing="base">
          <Banner status="warning">{ineligibleReason}</Banner>
        </BlockStack>
      </CustomerAccountAction>
    );
  }

  // Success state
  if (step === "success") {
    return (
      <CustomerAccountAction title={translate("success.title")}>
        <BlockStack spacing="base">
          <Banner status="success">{translate("success.message")}</Banner>
          <Text>{translate("success.checkStatus")}</Text>
        </BlockStack>
      </CustomerAccountAction>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <CustomerAccountAction title={translate("returnForm.title")}>
        <BlockStack spacing="base">
          <Banner status="critical">{errorMessage}</Banner>
        </BlockStack>
      </CustomerAccountAction>
    );
  }

  // Submitting state
  if (step === "submitting") {
    return (
      <CustomerAccountAction title={translate("returnForm.title")}>
        <BlockStack spacing="base">
          <Text>{translate("returnForm.submitting")}</Text>
        </BlockStack>
      </CustomerAccountAction>
    );
  }

  // Build reason options
  const reasonOptions = [
    { value: "", label: translate("returnForm.selectReason") },
    ...reasons.map((r) => ({ value: r.id, label: r.label })),
  ];

  const selectedCount = items.filter((i) => i.selected).length;

  // Form state
  return (
    <CustomerAccountAction title={translate("returnForm.title")}>
      <BlockStack spacing="base">
        {errorMessage ? (
          <Banner status="critical">{errorMessage}</Banner>
        ) : null}

        {/* Return instructions from store */}
        {settings?.returnInstructions ? (
          <Banner status="info">{settings.returnInstructions}</Banner>
        ) : null}

        {/* Return window info */}
        {settings?.returnWindowDays ? (
          <Text appearance="subdued">
            {translate("returnForm.title")} ({settings.returnWindowDays} {translate("returnForm.title")})
          </Text>
        ) : null}

        <Heading level={3}>{translate("returnForm.selectItems")}</Heading>

        {items.length === 0 ? (
          <Text appearance="subdued">{translate("returnForm.noEligibleItems")}</Text>
        ) : (
          items.map((item) => (
            <BlockStack key={item.id} spacing="tight">
              <InlineStack spacing="base" blockAlignment="center">
                <Checkbox
                  checked={item.selected}
                  onChange={(checked) => handleItemToggle(item.id, checked)}
                >
                  <BlockStack spacing="extraTight">
                    <Text emphasis="bold">{item.title}</Text>
                    {item.variantTitle ? (
                      <Text appearance="subdued">{item.variantTitle}</Text>
                    ) : null}
                    <Text appearance="subdued">
                      {item.price.toFixed(2)} {item.currency} x {item.quantity}
                    </Text>
                  </BlockStack>
                </Checkbox>
              </InlineStack>

              {item.selected ? (
                <View padding={["none", "none", "none", "base"]}>
                  <BlockStack spacing="tight">
                    <Select
                      label={translate("returnForm.quantityLabel")}
                      value={String(item.returnQuantity)}
                      onChange={(val) => handleQuantityChange(item.id, val)}
                      options={Array.from(
                        { length: item.quantity },
                        (_, i) => ({
                          value: String(i + 1),
                          label: String(i + 1),
                        })
                      )}
                    />
                    <Select
                      label={translate("returnForm.reasonLabel")}
                      value={item.reasonId}
                      onChange={(val) => handleReasonChange(item.id, val)}
                      options={reasonOptions}
                    />
                    {/* Show note field if reason requires it or always as optional */}
                    {item.reasonId ? (
                      <TextField
                        label={
                          reasons.find((r) => r.id === item.reasonId)?.requireNote
                            ? translate("returnForm.detailsRequired")
                            : translate("returnForm.detailsOptional")
                        }
                        value={item.note}
                        onChange={(val) => handleNoteChange(item.id, val)}
                        multiline={2}
                      />
                    ) : null}
                  </BlockStack>
                </View>
              ) : null}

              <Divider />
            </BlockStack>
          ))
        )}

        {/* Bank account for refund */}
        <Heading level={3}>IBAN</Heading>
        <TextField
          label="IBAN (cislo uctu pre vratenie penazi)"
          value={customerIban}
          onChange={setCustomerIban}
        />

        <Heading level={3}>{translate("returnForm.customerNotes")}</Heading>
        <TextField
          label={translate("returnForm.customerNotes")}
          value={customerNotes}
          onChange={setCustomerNotes}
          multiline={3}
        />

        <Button
          onPress={handleSubmit}
          disabled={selectedCount === 0}
        >
          {translate("returnForm.submit")} ({selectedCount})
        </Button>
      </BlockStack>
    </CustomerAccountAction>
  );
}
