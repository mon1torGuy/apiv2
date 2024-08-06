import { HonoRequest, Next } from 'hono';
import { Context } from 'hono';
import { z } from 'zod';

interface RateLimit {
	limit: number;
	refillInterval: number;
	refillRate: number;
	type: string;
}

export function isValidRateLimit(ratelimit: RateLimit): boolean {
	return (
		ratelimit &&
		typeof ratelimit.limit === 'number' &&
		typeof ratelimit.refillInterval === 'number' &&
		typeof ratelimit.refillRate === 'number' &&
		typeof ratelimit.type === 'string'
	);
}

export function generateToken(length: number = 20): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const charactersLength = characters.length;
	let token = '';

	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * charactersLength);
		token += characters[randomIndex];
	}

	return token;
}

export function generateAPIKey(byteLength: number): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const apiKey = Array.from(bytes, (byte) => characters[byte % characters.length]).join('');
	return apiKey;
}

export function ipToDecimal(ipAddress: string): number {
	// Split the IP address into octets (sections)
	const octets = ipAddress.split('.');

	// Validate the format (4 octets, each between 0 and 255)
	if (octets.length !== 4 || !octets.every((octet) => isValidOctet(octet))) {
		return 0;
	}

	// Convert each octet to a number and shift/add for final decimal value
	return octets.reduce((decimal, octet, index) => {
		const octetValue = parseInt(octet, 10);
		return decimal + octetValue * Math.pow(256, 3 - index);
	}, 0);
}

function isValidOctet(octet: string): boolean {
	const octetValue = parseInt(octet, 10);
	return !isNaN(octetValue) && octetValue >= 0 && octetValue <= 255;
}

export function isValidHttpUrl(urlString: string): boolean {
	let url: URL;

	try {
		url = new URL(urlString);
	} catch (_) {
		return false;
	}

	return url.protocol === 'http:' || url.protocol === 'https:';
}

export function isJWT(token: string): boolean {
	// Regular expression pattern for JWT
	const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

	// Check if the token matches the JWT pattern
	return jwtPattern.test(token);
}

const RatelimitSchema = z.object({
	limit: z.number(),
	timeWindow: z.number(),
});

const RefillSchema = z.object({
	amount: z.number(),
	interval: z.string(),
});

export const RequestKeyCustomSchema = z.object({
	environment: z.string().optional(),
	remaining: z.number().nonnegative().optional(),
	byteLength: z.number().int().min(16).max(128).optional(),
	expires: z.number().nonnegative().optional(),
	metadata: z.record(z.any()).nullable().optional(),
	ratelimit: RatelimitSchema.optional(),
	refill: RefillSchema.optional(),
});

export const RequestKeySchema = z.object({
	amount: z.number().nonnegative(),
});

export const RequestApplicationSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	prefix: z.string().optional(),
	remaining: z.number().nonnegative().optional(),
	byteLength: z.number().int().min(16).max(128).optional(),
	expires: z.number().nonnegative().optional(),
	metadata: z.record(z.any()).nullable().optional(),
	ratelimit: RatelimitSchema.optional(),
	refill: RefillSchema.optional(),
	jwk: z.string().optional(),
	keyType: z.enum(['jwt', 'token']),
});

export const RequestApplicationDashSchema = z.object({
	name: z.string({ message: 'Name is required.' }),
	description: z.string().optional(),
	prefix: z.string().optional(),
	remaining: z.number().nonnegative().optional(),
	byteLength: z.number().int().min(16).max(128).optional(),
	expires: z.number().nonnegative().optional(),
	metadata: z.record(z.any()).nullable().optional(),
	rlRequests: z.number().nonnegative().optional(),
	rlInterval: z.number().nonnegative().optional(),
	rfAmount: z.number().nonnegative().optional(),
	rfInterval: z.string().optional(),
	jwk: z.string().optional(),
	keyType: z.enum(['jwt', 'token']),
});

export const RequestMonitorDashSchema = z.object({
	url: z.string().url(),
	status_code: z.number().int().min(200).max(299),
	name: z.string(),
});

export const RequestMonitorSchema = z.object({
	url: z.string().url(),
	status_code: z.number().int().min(200).max(299),
	name: z.string(),
});
export const RequestMonitorUpdateSchema = z.object({
	url: z.string().url().optional(),
	status_code: z.number().int().min(200).max(299).optional(),
	name: z.string().optional(),
	mon_status: z.string().optional(),
});

export const RequestJWKCreateSchema = z.object({
	jsonKey: z
		.object({
			keys: z.any().array(),
		})
		.optional(),
	jwtEndpoint: z.string().url().optional(),
	type: z.enum(['jwkEndpoint', 'jsonKey']),
});

export async function authMiddleware(c: Context, next: Next) {
	try {
		const authHeader = c.req.header('Authorization');
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const token = authHeader.split(' ')[1];
			const accountKeys = await c.env.account_keys.get(token);
			if (!accountKeys) {
				return c.json({ success: true, message: 'Unauthorized', data: [] }, 403);
			}
			c.set('accountKeys', accountKeys);
			await next();
		} else {
			return c.json({ success: true, message: 'Unauthorized', data: [] }, 403);
		}
	} catch (error) {
		return c.json({ success: true, message: 'Internal Server Error', data: [] }, 500);
	}
}

export async function hashPassword(password: string, providedSalt?: Uint8Array): Promise<string> {
	const encoder = new TextEncoder();
	const salt = new Uint8Array([21, 34, 56, 78, 90, 12, 34, 56, 78, 90, 12, 34, 56, 78, 90, 12]);
	// Use provided salt if available, otherwise generate a new one
	// const salt = providedSalt || crypto.getRandomValues(new Uint8Array(16));
	const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, [
		'deriveBits',
		'deriveKey',
	]);
	const key = await crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: salt,
			iterations: 100000,
			hash: 'SHA-256',
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		true,
		['encrypt', 'decrypt']
	);
	const exportedKey = (await crypto.subtle.exportKey('raw', key)) as ArrayBuffer;
	const hashBuffer = new Uint8Array(exportedKey);
	const hashArray = Array.from(hashBuffer);
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	const saltHex = Array.from(salt)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `${saltHex}:${hashHex}`;
}
