import { RateLimit } from './DO/RateLimit';
import { Remain } from './DO/Remaining';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sentry } from '@hono/sentry';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';
import { authMiddleware } from './utils';
import { createPrismaClient } from './prisma';
import applications from './applications';
import jwt from './jwt';
import monitor from './monitor';
import userAuthentication from './userAuthentication';
import dashboard from './dashboard';
import key from './keys';
import authenticate from './authenticate';
import { openapiSchema } from '../openapi';
import { MonitorEvent } from './types';
import { logMonitorEvent } from './logging';
import { forbidden } from './responses';
import { secureHeaders } from 'hono/secure-headers';

type Bindings = {
	typeauth_keys: KVNamespace;
	refresh_token_users: KVNamespace;
	app_jwt_keys: KVNamespace;
	SENTRY_DSN: string;
	DB: D1Database;
	ACCOUNT_ID: string;
	member_invitations: KVNamespace;
	RATE_LIMITER: DurableObjectNamespace;
	REMAINING: DurableObjectNamespace;
	ANALYTICS: AnalyticsEngineDataset;
	MONITOR: AnalyticsEngineDataset;
	AUDIT: AnalyticsEngineDataset;
	webauthn: KVNamespace
};

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', sentry());
app.use('*', cors());
app.use('*', secureHeaders());
app.notFound((c) => {
	console.log(c.req.url);
	return c.json(forbidden, 403);
});
//! Applications
app.get('/openapi.json', async (c) => {
	return c.json(openapiSchema);
});

app.get('/', (c) => {
	return c.redirect('https://docs.typeauth.com/', 302);
});

app.route('/users', userAuthentication)
app.route('/:accId/applications/:appId/keys', key);
app.route('/:accId/applications', applications);
app.route('/:accId/jwts', jwt);
app.route('/:accId/monitors', monitor);
app.route('/dashboard', dashboard);
app.route('/authenticate', authenticate);

//!Keys
//? List all keys
app.get('/:accId/keys', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accId = c.req.param('accId');
	try {
		const keys = await prisma.key.findMany({
			where: { accId: accId },
			include: {
				Application: {
					select: {
						name: true,
					},
				},
			},
		});
		if (keys.length === 0) return c.json({ succces: true, message: 'Keys not found', data: [] });

		for (let key of keys) {
			const id = c.env.REMAINING.idFromName(key.value);
			const bucket = c.env.REMAINING.get(id);
			const response = await bucket.fetch(new Request(`https://remainer?key=${key.value}&get=true`));
			const jsonResponse: { remaining: number } = await response.json();
			//@ts-expect-error
			key.applicationName = key.Application.name;
			//@ts-expect-error
			key.Application = undefined;

			key.remaining = jsonResponse.remaining === undefined ? null : jsonResponse.remaining;
			key.ratelimit = key.ratelimit != null ? JSON.parse(key.ratelimit) : null;
			key.refill = key.refill != null ? JSON.parse(key.refill) : null;
		}

		// const formattedkeys = keys.map((key) => ({
		// 	...key,
		// 	ratelimit: key.ratelimit != null ? JSON.parse(key.ratelimit) : null,
		// 	refill: key.refill != null ? JSON.parse(key.refill) : null,
		// }));
		return c.json({ succces: true, message: '', data: keys });
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
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

//! Monitor Iniformation GET
app.get('/monitors', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const monitorsHttp = await prisma.httpmonitor.findMany({
			where: { mon_status: true },
		});

		const monitorsDNS = await prisma.tcpmonitor.findMany({ where: { mon_status: true } });

		if (monitorsDNS.length === 0 && monitorsHttp.length === 0) {
			return c.json({ success: true, message: 'Monitors not found', data: [] }, 404);
		}
		return c.json({ success: true, message: '', data: [...monitorsDNS, ...monitorsHttp] }, 200);
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error', data: [] }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
		}
	}
});
//! Monitor Iniformation POST
app.post('/monitors', authMiddleware, async (c) => {
	try {
		const bodyJSON: MonitorEvent[] = await c.req.json();

		bodyJSON.forEach((event) => {
			if (!event.status || !event.time || !event.accID || !event.monId) {
				return c.json({ success: false, message: 'Missing body paramters', data: [] }, 400);
			}
			logMonitorEvent({ accID: event.accID, monId: event.monId, time: event.time, status: event.status }, c.env);

			return c.json('ok');
		});
		return c.json('Error', 500);
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error', data: [] }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
		}
	}
});

export { RateLimit, Remain };
export default app;
