import { AuditEvent, KeyUsageEvent, MonitorEvent } from './types';

type Bindings = {
	typeauth_keys: KVNamespace;
	app_jwt_keys: KVNamespace;
	SENTRY_DSN: string;
	DB: D1Database;
	ACCOUNT_ID: string;
	RATE_LIMITER: DurableObjectNamespace;
	REMAINING: DurableObjectNamespace;
	ANALYTICS: AnalyticsEngineDataset;
	MONITOR: AnalyticsEngineDataset;
	AUDIT: AnalyticsEngineDataset;
};

export async function logKeyUsageEvent(event: KeyUsageEvent, env: Bindings): Promise<void> {
	const { accID, appID, appName, keyID, success, metadata, ipAddress, userAgent } = event;

	await env.ANALYTICS.writeDataPoint({
		blobs: [accID, appID, keyID, userAgent, appName],
		doubles: [success, ipAddress],
		indexes: [keyID],
	});
}

export async function logMonitorEvent(event: MonitorEvent, env: Bindings): Promise<void> {
	const { accID, status, time, monId } = event;

	await env.MONITOR.writeDataPoint({
		blobs: [accID, monId, status],
		doubles: [time],
		indexes: [monId],
	});
}
export async function logAuditEvent(event: AuditEvent, env: Bindings): Promise<void> {
	const { accID, userID, time, action } = event;

	await env.AUDIT.writeDataPoint({
		blobs: [accID, userID, action],
		doubles: [time],
		indexes: [accID],
	});
}
