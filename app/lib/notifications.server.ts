import { prisma } from "../db.server";
import { EMAIL_TEMPLATE_TYPES } from "../types/returns";
import type { EmailTemplateType } from "../types/returns";

/**
 * Email notification system using Resend
 * Set RESEND_API_KEY in .env to enable
 */

// Default email templates
const DEFAULT_TEMPLATES: Record<
  EmailTemplateType,
  { subject: string; bodyHtml: string }
> = {
  return_confirmed: {
    subject: "Return Request Received - {{orderName}}",
    bodyHtml: `
      <h2>Return Request Received</h2>
      <p>Dear {{customerName}},</p>
      <p>We have received your return request for order <strong>{{orderName}}</strong>.</p>
      <p>We will review your request and get back to you shortly.</p>
      <h3>Items for Return:</h3>
      {{itemsList}}
      <p>Thank you for your patience.</p>
    `,
  },
  return_approved: {
    subject: "Return Approved - {{orderName}}",
    bodyHtml: `
      <h2>Return Request Approved</h2>
      <p>Dear {{customerName}},</p>
      <p>Your return request for order <strong>{{orderName}}</strong> has been approved.</p>
      {{#returnInstructions}}
      <h3>Return Instructions:</h3>
      <p>{{returnInstructions}}</p>
      {{/returnInstructions}}
      {{#trackingInfo}}
      <h3>Tracking Info:</h3>
      <p>Carrier: {{shippingCarrier}}</p>
      <p>Tracking: {{trackingNumber}}</p>
      {{/trackingInfo}}
      <p>Thank you!</p>
    `,
  },
  return_rejected: {
    subject: "Return Request Update - {{orderName}}",
    bodyHtml: `
      <h2>Return Request Update</h2>
      <p>Dear {{customerName}},</p>
      <p>Unfortunately, your return request for order <strong>{{orderName}}</strong> could not be approved.</p>
      {{#adminNotes}}
      <p><strong>Reason:</strong> {{adminNotes}}</p>
      {{/adminNotes}}
      <p>If you have any questions, please contact our support team.</p>
    `,
  },
  return_refunded: {
    subject: "Refund Processed - {{orderName}}",
    bodyHtml: `
      <h2>Refund Processed</h2>
      <p>Dear {{customerName}},</p>
      <p>Your refund of <strong>{{refundAmount}} {{currency}}</strong> for order <strong>{{orderName}}</strong> has been processed.</p>
      <p>Please allow 5-10 business days for the refund to appear in your account.</p>
      <p>Thank you!</p>
    `,
  },
};

/**
 * Get or create email template for a store
 */
export async function getEmailTemplate(
  shop: string,
  type: EmailTemplateType
) {
  let template = await prisma.emailTemplate.findUnique({
    where: { shop_type: { shop, type } },
  });

  if (!template) {
    const defaults = DEFAULT_TEMPLATES[type];
    template = await prisma.emailTemplate.create({
      data: {
        shop,
        type,
        subject: defaults.subject,
        bodyHtml: defaults.bodyHtml,
      },
    });
  }

  return template;
}

/**
 * Render email template with variables
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let result = template;

  // Replace simple variables {{var}}
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value || "");
  });

  // Handle conditional blocks {{#var}}...{{/var}}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{#${key}}}([\\s\\S]*?){{/${key}}}`, "g");
    if (value) {
      result = result.replace(regex, "$1");
    } else {
      result = result.replace(regex, "");
    }
  });

  return result;
}

/**
 * Send notification email
 */
export async function sendNotification(
  shop: string,
  returnRequestId: string,
  type: EmailTemplateType,
  recipient: string,
  variables: Record<string, string | undefined>
) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!settings?.notifyCustomerEmail) {
    return null;
  }

  const template = await getEmailTemplate(shop, type);

  if (!template.isActive) {
    return null;
  }

  const subject = renderTemplate(template.subject, variables);
  const body = renderTemplate(template.bodyHtml, variables);

  // Create notification record
  const notification = await prisma.notification.create({
    data: {
      returnRequestId,
      type,
      channel: "email",
      recipient,
      subject,
      body,
    },
  });

  // Send via Resend if API key is configured
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: `${settings.emailFromName || "Returns"} <onboarding@resend.dev>`,
        to: recipient,
        subject,
        html: body,
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: { sentAt: new Date() },
      });

      console.log(`Email sent to ${recipient}: ${subject}`);
    } catch (error: any) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          failedAt: new Date(),
          errorMessage: error.message,
        },
      });

      console.error(`Failed to send email to ${recipient}:`, error.message);
    }
  } else {
    console.log(
      `[DEV] Email notification (no Resend API key): To: ${recipient}, Subject: ${subject}`
    );

    // Mark as sent in dev mode
    await prisma.notification.update({
      where: { id: notification.id },
      data: { sentAt: new Date() },
    });
  }

  return notification;
}

/**
 * Send admin notification about new return
 */
export async function notifyAdmin(
  shop: string,
  returnRequestId: string,
  variables: Record<string, string | undefined>
) {
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });

  if (!settings?.notifyAdminEmail || !settings.adminEmailAddress) {
    return null;
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  const notification = await prisma.notification.create({
    data: {
      returnRequestId,
      type: "admin_notification",
      channel: "email",
      recipient: settings.adminEmailAddress,
      subject: `New Return Request - ${variables.orderName || ""}`,
      body: `New return request from ${variables.customerName} for order ${variables.orderName}. Login to your Shopify admin to review.`,
    },
  });

  if (resendApiKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: `Returns Manager <onboarding@resend.dev>`,
        to: settings.adminEmailAddress,
        subject: `New Return Request - ${variables.orderName || ""}`,
        html: `
          <h2>New Return Request</h2>
          <p><strong>Order:</strong> ${variables.orderName}</p>
          <p><strong>Customer:</strong> ${variables.customerName} (${variables.customerEmail})</p>
          <p>Login to your Shopify admin to review and process this return.</p>
        `,
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: { sentAt: new Date() },
      });
    } catch (error: any) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          failedAt: new Date(),
          errorMessage: error.message,
        },
      });
    }
  }

  return notification;
}
