-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "apiKey" TEXT,
    "plan" TEXT NOT NULL,
    "clerkId" TEXT,
    "primary_email" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "subscription_email" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPending" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "token" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserForgot" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserForgot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT,
    "avatar" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccountUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountUser_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "accId" TEXT NOT NULL,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expires" INTEGER NOT NULL DEFAULT 0,
    "ratelimit" TEXT,
    "refill" TEXT,
    "prefix" TEXT,
    "keyType" TEXT NOT NULL,
    "jwk" TEXT,
    "remaining" INTEGER,
    "byteLength" INTEGER NOT NULL DEFAULT 32,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Key" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "accId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL DEFAULT 135,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "environment" TEXT NOT NULL DEFAULT 'default',
    "expires" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "ratelimit" TEXT,
    "refill" TEXT,
    "remaining" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Key_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Key_appId_fkey" FOREIGN KEY ("appId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dnsmonitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ips" TEXT NOT NULL,
    "mon_status" BOOLEAN NOT NULL DEFAULT true,
    "hostname" TEXT NOT NULL,
    "checks_down" INTEGER NOT NULL,
    "checks_up" INTEGER NOT NULL,
    "dns_error" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "europe" BOOLEAN NOT NULL DEFAULT false,
    "america" BOOLEAN NOT NULL DEFAULT true,
    "asia" BOOLEAN NOT NULL DEFAULT false,
    "middle" BOOLEAN NOT NULL DEFAULT false,
    "isStatusPage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dnsmonitor_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Httpmonitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "mon_status" BOOLEAN NOT NULL DEFAULT true,
    "ssl_verify" BOOLEAN NOT NULL DEFAULT true,
    "follow_redir" BOOLEAN NOT NULL DEFAULT true,
    "method" TEXT NOT NULL,
    "req_timeout" INTEGER NOT NULL,
    "req_headers" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "checks_down" INTEGER NOT NULL,
    "checks_up" INTEGER NOT NULL,
    "europe" BOOLEAN NOT NULL DEFAULT false,
    "america" BOOLEAN NOT NULL DEFAULT true,
    "asia" BOOLEAN NOT NULL DEFAULT false,
    "middle" BOOLEAN NOT NULL DEFAULT false,
    "isStatusPage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Httpmonitor_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tcpmonitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "mon_status" BOOLEAN NOT NULL DEFAULT true,
    "interval" INTEGER NOT NULL,
    "checks_down" INTEGER NOT NULL,
    "checks_up" INTEGER NOT NULL,
    "europe" BOOLEAN NOT NULL DEFAULT false,
    "america" BOOLEAN NOT NULL DEFAULT true,
    "asia" BOOLEAN NOT NULL DEFAULT false,
    "middle" BOOLEAN NOT NULL DEFAULT false,
    "isStatusPage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tcpmonitor_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SSLcertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accId" TEXT NOT NULL,
    "monId" TEXT NOT NULL,
    "certificate" TEXT NOT NULL,
    "expired_at" INTEGER NOT NULL,
    "checked_at" INTEGER NOT NULL,
    CONSTRAINT "SSLcertificate_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SSLcertificate_monId_fkey" FOREIGN KEY ("monId") REFERENCES "Httpmonitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "upvote" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Jwks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accId" TEXT NOT NULL,
    "appID" TEXT,
    "jwk" TEXT NOT NULL,
    "jwtEndpoint" TEXT,
    "lastChekcked" INTEGER NOT NULL,
    "kid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Jwks_accId_fkey" FOREIGN KEY ("accId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_primary_email_key" ON "Account"("primary_email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPending_email_key" ON "UserPending"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserForgot_token_key" ON "UserForgot"("token");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountUser_accId_userId_key" ON "AccountUser"("accId", "userId");
