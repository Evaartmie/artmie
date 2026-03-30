import { Outlet } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function App() {
  return (
    <AppProvider isEmbeddedApp>
      <ui-nav-menu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/returns">Returns</a>
        <a href="/app/settings">Settings</a>
        <a href="/app/analytics">Analytics</a>
      </ui-nav-menu>
      <Outlet />
    </AppProvider>
  );
}
