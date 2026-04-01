import {
  reactExtension,
  useTranslate,
  Text,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.order.action.menu-item.render",
  () => <MenuItemAction />
);

function MenuItemAction() {
  const translate = useTranslate();
  return <Text>{translate("menuItem.label")}</Text>;
}
