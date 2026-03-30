-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "returnWindowDays" INTEGER NOT NULL DEFAULT 30,
    "autoApproveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveMaxValue" REAL,
    "autoApproveReasons" TEXT,
    "eligibleProductTags" TEXT,
    "excludedProductTags" TEXT,
    "notifyCustomerEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyAdminEmail" BOOLEAN NOT NULL DEFAULT true,
    "adminEmailAddress" TEXT,
    "emailFromName" TEXT,
    "returnInstructions" TEXT,
    "requirePhotos" BOOLEAN NOT NULL DEFAULT false,
    "maxPhotosPerItem" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReturnReason" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "shopifyReason" TEXT NOT NULL DEFAULT 'OTHER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requireNote" BOOLEAN NOT NULL DEFAULT false,
    "requirePhoto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyReturnId" TEXT,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalRefundAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "adminNotes" TEXT,
    "customerNotes" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippingCarrier" TEXT,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "receivedAt" DATETIME,
    "refundedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReturnLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnRequestId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "pricePerItem" REAL NOT NULL,
    "reasonId" TEXT,
    "customerNote" TEXT,
    CONSTRAINT "ReturnLineItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnLineItem_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "ReturnReason" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnRequestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnPhoto_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnRequestId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnStatusHistory_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnRequestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettings_shop_key" ON "StoreSettings"("shop");

-- CreateIndex
CREATE INDEX "ReturnReason_shop_idx" ON "ReturnReason"("shop");

-- CreateIndex
CREATE INDEX "ReturnRequest_shop_idx" ON "ReturnRequest"("shop");

-- CreateIndex
CREATE INDEX "ReturnRequest_shopifyOrderId_idx" ON "ReturnRequest"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_customerId_idx" ON "ReturnRequest"("customerId");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");

-- CreateIndex
CREATE INDEX "ReturnRequest_createdAt_idx" ON "ReturnRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ReturnLineItem_returnRequestId_idx" ON "ReturnLineItem"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnPhoto_returnRequestId_idx" ON "ReturnPhoto"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnStatusHistory_returnRequestId_idx" ON "ReturnStatusHistory"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnStatusHistory_createdAt_idx" ON "ReturnStatusHistory"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_returnRequestId_idx" ON "Notification"("returnRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_shop_type_key" ON "EmailTemplate"("shop", "type");
