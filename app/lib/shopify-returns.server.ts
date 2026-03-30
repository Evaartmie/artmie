/**
 * Shopify GraphQL Admin API integration for Returns
 * All mutations and queries for interacting with Shopify's Returns API
 */

// ─── Queries ────────────────────────────────────────────────────────────

export const GET_ORDER_QUERY = `
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      name
      displayFulfillmentStatus
      createdAt
      currencyCode
      fulfillments(first: 10) {
        nodes {
          id
          deliveredAt
          estimatedDeliveryAt
          status
          fulfillmentLineItems(first: 50) {
            nodes {
              id
              lineItem {
                id
                title
                variantTitle
                quantity
                originalUnitPriceSet {
                  shopMoney { amount currencyCode }
                }
                sku
                image { url altText }
                product { id tags }
                variant { id }
                currentQuantity
              }
              quantity
            }
          }
        }
      }
      customer {
        id
        email
        firstName
        lastName
      }
      returnStatus
      returns(first: 10) {
        nodes {
          id
          status
          returnLineItems(first: 50) {
            nodes {
              id
              quantity
              returnReason
              customerNote
              fulfillmentLineItem {
                lineItem { title variantTitle }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_CUSTOMER_ORDERS_QUERY = `
  query GetCustomerOrders($customerId: ID!, $first: Int!) {
    customer(id: $customerId) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          displayFulfillmentStatus
          createdAt
          returns(first: 5) {
            nodes {
              id
              status
            }
          }
        }
      }
    }
  }
`;

// ─── Mutations ──────────────────────────────────────────────────────────

export const RETURN_REQUEST_MUTATION = `
  mutation ReturnRequest($input: ReturnRequestInput!) {
    returnRequest(input: $input) {
      return {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const RETURN_APPROVE_MUTATION = `
  mutation ReturnApproveRequest($input: ReturnApproveRequestInput!) {
    returnApproveRequest(input: $input) {
      return {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const RETURN_DECLINE_MUTATION = `
  mutation ReturnDeclineRequest($input: ReturnDeclineRequestInput!) {
    returnDeclineRequest(input: $input) {
      return {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const RETURN_CLOSE_MUTATION = `
  mutation ReturnClose($id: ID!) {
    returnClose(id: $id) {
      return {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const REFUND_CREATE_MUTATION = `
  mutation RefundCreate($input: RefundInput!) {
    refundCreate(input: $input) {
      refund {
        id
        totalRefundedSet {
          shopMoney { amount currencyCode }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Helper Functions ───────────────────────────────────────────────────

interface GraphQLClient {
  graphql: (query: string, options?: { variables?: any }) => Promise<any>;
}

/**
 * Create a return request in Shopify
 */
export async function createShopifyReturn(
  admin: GraphQLClient,
  orderId: string,
  returnLineItems: Array<{
    fulfillmentLineItemId: string;
    quantity: number;
    returnReason: string;
    customerNote?: string;
  }>
) {
  const response = await admin.graphql(RETURN_REQUEST_MUTATION, {
    variables: {
      input: {
        orderId,
        returnLineItems: returnLineItems.map((item) => ({
          fulfillmentLineItemId: item.fulfillmentLineItemId,
          quantity: item.quantity,
          returnReason: item.returnReason,
          customerNote: item.customerNote || "",
        })),
      },
    },
  });

  const data = await response.json();
  const result = data.data?.returnRequest;

  if (result?.userErrors?.length > 0) {
    throw new Error(
      `Shopify error: ${result.userErrors.map((e: any) => e.message).join(", ")}`
    );
  }

  return result?.return;
}

/**
 * Approve a return request in Shopify
 */
export async function approveShopifyReturn(
  admin: GraphQLClient,
  returnId: string
) {
  const response = await admin.graphql(RETURN_APPROVE_MUTATION, {
    variables: {
      input: { id: returnId },
    },
  });

  const data = await response.json();
  const result = data.data?.returnApproveRequest;

  if (result?.userErrors?.length > 0) {
    throw new Error(
      `Shopify error: ${result.userErrors.map((e: any) => e.message).join(", ")}`
    );
  }

  return result?.return;
}

/**
 * Decline a return request in Shopify
 */
export async function declineShopifyReturn(
  admin: GraphQLClient,
  returnId: string,
  declineReason?: string
) {
  const response = await admin.graphql(RETURN_DECLINE_MUTATION, {
    variables: {
      input: {
        id: returnId,
        declineReason: declineReason || "OTHER",
      },
    },
  });

  const data = await response.json();
  const result = data.data?.returnDeclineRequest;

  if (result?.userErrors?.length > 0) {
    throw new Error(
      `Shopify error: ${result.userErrors.map((e: any) => e.message).join(", ")}`
    );
  }

  return result?.return;
}

/**
 * Close a return in Shopify
 */
export async function closeShopifyReturn(
  admin: GraphQLClient,
  returnId: string
) {
  const response = await admin.graphql(RETURN_CLOSE_MUTATION, {
    variables: { id: returnId },
  });

  const data = await response.json();
  const result = data.data?.returnClose;

  if (result?.userErrors?.length > 0) {
    throw new Error(
      `Shopify error: ${result.userErrors.map((e: any) => e.message).join(", ")}`
    );
  }

  return result?.return;
}

/**
 * Get order details for return eligibility check
 */
export async function getOrderForReturn(
  admin: GraphQLClient,
  orderId: string
) {
  const response = await admin.graphql(GET_ORDER_QUERY, {
    variables: { id: orderId },
  });

  const data = await response.json();
  return data.data?.order;
}
