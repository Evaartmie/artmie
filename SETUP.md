# Shopify Returns Manager - Setup Guide

## Prerequisites

- Node.js 18+
- Shopify CLI (`npm install -g @shopify/cli`)
- Shopify Partner account
- A Shopify development store (or Shopify Plus store)

## Quick Start

### 1. Install dependencies

```bash
cd shopify-returns-manager
npm install
```

### 2. Create Shopify app

```bash
shopify app dev
```

This will:
- Prompt you to create a new app or connect to existing one
- Auto-fill `.env` with SHOPIFY_API_KEY and SHOPIFY_API_SECRET
- Set up the app URL

### 3. Set up database

```bash
npx prisma migrate dev --name init
```

### 4. Start development

```bash
shopify app dev
```

The app will:
- Start the Remix dev server
- Create a tunnel to your local machine
- Install the app on your dev store
- Open the Shopify admin with the embedded app

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `SHOPIFY_API_KEY` | Auto-filled by Shopify CLI |
| `SHOPIFY_API_SECRET` | Auto-filled by Shopify CLI |
| `SCOPES` | `read_orders,write_orders,read_returns,write_returns,read_customers,read_products` |
| `RESEND_API_KEY` | Optional - for email notifications (get at https://resend.com) |

### Required Shopify API Scopes

The app requires these scopes (configured in `shopify.app.toml`):
- `read_orders` - Read order data
- `write_orders` - Update order status
- `read_returns` - Read return data
- `write_returns` - Create/update returns
- `read_customers` - Read customer data
- `read_products` - Read product data

### Email Notifications (Optional)

1. Create an account at https://resend.com
2. Get your API key
3. Add to `.env`: `RESEND_API_KEY=re_xxxxx`
4. Configure sender email in Settings → Notifications

## Deploying to Production

### Option A: Railway.app (Recommended)

1. Push code to GitHub
2. Go to https://railway.app
3. Create new project → Deploy from GitHub
4. Add environment variables
5. The app will auto-deploy

### Option B: Fly.io

```bash
fly launch
fly secrets set SHOPIFY_API_KEY=xxx SHOPIFY_API_SECRET=xxx
fly deploy
```

### After Deployment

1. Update your Shopify app URL in the Partner Dashboard
2. Run `shopify app deploy` to deploy extensions
3. Install the app on your stores

## Multi-Store Setup

This app supports multiple stores automatically:
1. Each store installs the app separately
2. Data is isolated per store (via `shop` field)
3. Settings are configured per store
4. No additional setup needed

## Troubleshooting

### Database issues
```bash
npx prisma migrate reset  # Reset and recreate database
npx prisma studio         # Visual database browser
```

### Extension not showing
- Ensure the Customer Account Extension is deployed: `shopify app deploy`
- Check that the store has customer accounts enabled
- Customer must be logged in to see the return option

### Webhooks not working
- Check Shopify Admin → Settings → Notifications → Webhooks
- Ensure the app URL is publicly accessible
- Check server logs for webhook processing errors
