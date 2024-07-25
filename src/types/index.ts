export interface Telemetry {
	url?: string;
	method?: string;
	headers?: {
		[key: string]: string;
	}[];
	ipaddress?: string;
	timeStamp?: number;
}

export interface AnalyticsEngineDataset {
	writeDataPoint: (data: { blobs: string[]; doubles: number[]; indexes: string[]; metadata?: Record<string, unknown> }) => Promise<void>;
}

export interface KVMetadata {
	act: boolean;
	exp: number;
	rl: { limit: number; timeWindow: number } | null;
	rf: { amount: number; interval: number } | null;
	re: number | null;
	name: string;
}

export interface KeyUsageEvent {
	accID: string;
	appID: string;
	keyID: string;
	appName: string;
	success: number;
	ipAddress: number;
	userAgent: string;
	metadata?: Record<string, unknown>;
}

export interface MonitorEvent {
	accID: string;
	status: string;
	time: number;
	monId: string;
}

export interface AuditEvent {
	accID: string;
	userID: string;
	time: number;
	action: string;
}
