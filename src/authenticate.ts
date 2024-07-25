import { Hono } from 'hono';
import { createPrismaClient } from './prisma';
import { ipToDecimal, isJWT } from './utils';
import { importJWK, jwtVerify } from 'jose';
import { KVMetadata, Telemetry } from './types';
import { logKeyUsageEvent } from './logging';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';
import { forbidden } from './responses';

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

const app = new Hono<{ Bindings: Bindings }>();

app.post('/', async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { token, appID, telemetry } = await c.req.json();
		if (!token) {
			return c.json({ succes: false, message: 'Key is required', data: [] }, 400);
		}
		const jwt = isJWT(token);
		console.log(token);
		console.log(appID);
		console.log(telemetry);
		let telemetryObject: Telemetry = {};
		let userAgent = '';
		let IPaddress = 0;
		if (telemetry) {
			telemetryObject = telemetry;
			if (telemetryObject.ipaddress) {
				IPaddress = ipToDecimal(telemetryObject.ipaddress);
			}
			if (telemetryObject.headers) {
				//@ts-expect-error
				userAgent = telemetryObject.headers['user-agent'] || '';
			}
		}

		if (jwt) {
			const keys = await c.env.app_jwt_keys.get(appID, { type: 'json' });
			if (!keys) {
				return c.json({ success: false, message: 'Keys not found', data: [] }, 401);
			}

			let verified = false;
			let jwtError = false;
			//@ts-expect-error
			for (let key of keys) {
				const jwtKey = await importJWK(key);
				try {
					await jwtVerify(token, jwtKey);
					verified = true;
					break;
				} catch (error) {
					jwtError = true;
				}
			}
			if (jwtError) {
				return c.json({ success: false, message: 'JWT error', data: [] }, 500);
			}
			if (!verified) {
				return c.json({ success: false, message: 'Unauthorized', data: [] }, 403);
			}
		}

		let verificationSuccess = false;
		let applicationID: string = '';
		let keyId: string = '';
		let accID: string = '';

		// Check if the key exists in KV
		const { metadata, value } = await c.env.typeauth_keys.getWithMetadata<KVMetadata>(token);

		if (!value) {
			await logKeyUsageEvent(
				{
					accID: accID,
					appID: appID,
					keyID: keyId,
					appName: 'unknown',
					ipAddress: IPaddress,
					userAgent: userAgent,
					success: verificationSuccess ? 1 : 0,
					metadata: {
						userAgent: null,
						ipAddress: null,
					},
				},
				c.env
			);
			return c.json({ success: true, message: 'Unauthorized', data: [] }, 401);
		}
		let jsonValue;
		if (value) {
			jsonValue = JSON.parse(value);
			applicationID = jsonValue.appId;
			keyId = jsonValue.id;
			accID = jsonValue.accId;
		}
		if (applicationID != appID) {
			return c.json({ success: true, message: 'Unauthorized', data: [] }, 401);
		}
		if (metadata) {
			if (!metadata.act) {
				return c.json({ success: true, message: 'Key is disabled', data: [] }, 403);
			}
			if (metadata.exp && metadata.exp < Date.now()) {
				return c.json({ success: true, message: 'Key has expired', data: [] }, 403);
			}

			let rlObject = { limit: metadata.rl?.limit, timeWindow: metadata.rl?.timeWindow, remaining: 0 };
			if (metadata.rl != null) {
				const id = c.env.RATE_LIMITER.idFromName(token);
				const rateLimiter = c.env.RATE_LIMITER.get(id);
				const response = await rateLimiter.fetch(new Request(`https://ratelimiter?key=${token}`));
				const jsonResponse: { remaining: number } = await response.json();
				rlObject.remaining = jsonResponse.remaining;
				if (response.status === 429) {
					await logKeyUsageEvent(
						{
							accID: accID,
							appID: applicationID,
							keyID: keyId,
							appName: metadata.name,
							userAgent: userAgent,
							ipAddress: IPaddress,
							success: verificationSuccess ? 1 : 0,
							metadata: {
								userAgent: userAgent,
								ipAddress: IPaddress,
							},
						},
						c.env
					);
					return c.json(
						{
							success: false,
							error: 'Rate limit exceeded',
							remaining: jsonResponse.remaining,
						},
						429
					);
				} else if (response.status === 401) {
					return c.json({ success: true, message: 'Invalid key', data: [] }, 403);
				}
			}
			let remaObject = { remaining: 0 };
			if (metadata.re != null) {
				const id = c.env.REMAINING.idFromName(token);
				const bucket = c.env.REMAINING.get(id);
				const response = await bucket.fetch(new Request(`https://remainer?key=${token}`));
				const jsonResponse: { remaining: number } = await response.json();
				remaObject.remaining = jsonResponse.remaining;
				if (response.status === 200) {
					if (jsonResponse.remaining === 0) {
						metadata.act = false;
						jsonValue.enabled = false;
						await c.env.typeauth_keys.put(token, JSON.stringify(jsonValue), { metadata: metadata });
						await prisma.key.update({
							where: {
								id: keyId,
							},
							data: {
								enabled: false,
							},
						});
					}
				} else if (response.status === 429) {
					await logKeyUsageEvent(
						{
							accID: accID,
							appID: appID,
							keyID: keyId,
							appName: metadata.name,
							ipAddress: IPaddress,
							userAgent: userAgent,
							success: verificationSuccess ? 1 : 0,
							metadata: {
								userAgent: IPaddress,
								ipAddress: userAgent,
							},
						},
						c.env
					);
					return c.json(
						{
							success: false,
							message: 'Quota usage exceeded',
							data: jsonResponse.remaining,
						},
						429
					);
				} else if (response.status === 401) {
					// Invalid key
					return c.json({ success: false, message: 'Invalid key', data: [] }, 403);
				}
			}

			verificationSuccess = true; // Replace with your actual verification result

			await logKeyUsageEvent(
				{
					accID: accID,
					appID: appID,
					keyID: keyId,
					appName: metadata.name,
					ipAddress: IPaddress,
					userAgent: userAgent,
					success: verificationSuccess ? 1 : 0,
					metadata: {
						userAgent: null,
						ipAddress: null,
					},
				},
				c.env
			);

			return c.json({
				success: true,
				message: '',
				data: [{ valid: true, ratelimit: rlObject, ...remaObject, enabled: metadata.act }],
			});
		}
	} catch (error) {
		if (error instanceof SyntaxError) {
			// JSON parsing error
			return c.json({ success: true, message: 'Invalid JSON syntax', data: [] }, 400);
		} else if (error instanceof PrismaClientKnownRequestError) {
			// Prisma database error
			console.error('Prisma database error:', error);
			return c.json({ success: true, message: 'Database error', data: [] }, 500);
		} else {
			// Other errors
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
		}
	}
});

// app.notFound((c) => {
// 	return c.json(forbidden, 403);
// });

export default app;
