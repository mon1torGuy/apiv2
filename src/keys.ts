import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, generateAPIKey, RequestKeySchema } from './utils';
import { createPrismaClient } from './prisma';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';

type Bindings = {
	typeauth_keys: KVNamespace;
	refill_timestamp: KVNamespace;
	SENTRY_DSN: string;
	DB: D1Database;
	RATE_LIMITER: DurableObjectNamespace;
	REMAINING: DurableObjectNamespace;
};
const app = new Hono<{ Bindings: Bindings }>();
app.use('*', sentry());
app.use('*', cors());

//? Create a key
app.post('/', authMiddleware, async (c) => {
	const dayinseconds = 60 * 60 * 24;
	const weekinseconds = dayinseconds * 7;
	const monthinseconds = dayinseconds * 30;
	const prisma = createPrismaClient(c.env.DB);

	try {
		const appId = c.req.param('appId');
		const accId = c.req.param('accId');

		const application = await prisma.application.findUnique({
			where: { id: appId, accId: accId },
		});

		if (!application) {
			return c.json({ succes: true, message: 'Application or Account not found', data: [] }, 404);
		}
		const requestJSONBody = await c.req.json();
		console.log(requestJSONBody);
		const result = RequestKeySchema.safeParse(requestJSONBody);
		if (!result.success) {
			return c.json(
				{
					success: false,
					message: 'Invalid request body',
					errors: result.error.errors,
					data: [],
				},
				400
			);
		}

		const value = generateAPIKey(result.data.byteLength ?? application.byteLength);
		const key = await prisma.key.create({
			data: {
				Application: { connect: { id: appId } },
				account: { connect: { id: accId } },
				byteLength: result.data.byteLength ?? application.byteLength,
				value,
				environment: 'default',
				expires: result.data.expires ?? application.expires,
				metadata: JSON.stringify(result.data.metadata) ?? null,
				remaining: result.data.remaining ?? application.remaining,
				ratelimit: JSON.stringify(result.data.ratelimit) ?? application.ratelimit,
				refill: JSON.stringify(result.data.refill) ?? application.refill,
			},
		});
		await c.env.typeauth_keys.put(key.value, JSON.stringify(key), {
			metadata: {
				rl: result.data.ratelimit ?? JSON.parse(application.ratelimit!),
				re: key.remaining,
				rf: result.data.refill ?? JSON.parse(application.refill!),
				exp: key.expires,
				act: key.enabled,
				name: application.name,
			},
		});

		if (key.remaining !== null) {
			const id = c.env.REMAINING.idFromName(key.value);
			const bucket = c.env.REMAINING.get(id);
			await bucket.fetch(new Request(`https://remainer?key=${key.value}&set=${key.remaining}&init=true`));
		}
		if (key.ratelimit != null) {
			const id = c.env.RATE_LIMITER.idFromName(key.value);
			const ratelimiter = c.env.RATE_LIMITER.get(id);
			await ratelimiter.fetch(new Request(`https://ratelimiter?key=${key.value}&set=${key.ratelimit}&init=true`));
		}

		if (key.refill != null) {
			const rfObject: { interval: string; amount: number } = JSON.parse(key.refill!);
			let timeAdded = 0;
			if (rfObject.interval === 'daily') {
				timeAdded = Math.floor(dayinseconds + Date.now() / 1000);
			} else if (rfObject.interval === 'weekly') {
				timeAdded = Math.floor(weekinseconds + Date.now() / 1000);
			} else if (rfObject.interval === 'monthly') {
				timeAdded = Math.floor(monthinseconds + Date.now() / 1000);
			}
			await c.env.refill_timestamp.put(key.value, timeAdded.toString(), {
				metadata: {
					...rfObject,
				},
			});
		}
		key.refill = JSON.parse(key.refill!);
		key.ratelimit = JSON.parse(key.ratelimit!);
		key.metadata = JSON.parse(key.metadata!);

		return c.json({ success: true, message: '', data: [key] }, 201);
	} catch (error) {
		if (error instanceof SyntaxError) {
			return c.json({ success: false, message: 'Invalid JSON syntax', data: [] }, 400);
		} else if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error', data: [] }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
		}
	}
});

//? Verify a key
app.get('/:keyId/verify', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const appId = c.req.param('appId');
		const keyId = c.req.param('keyId');

		const key = await prisma.key.findUnique({
			where: { id: keyId },
			include: { Application: true },
		});

		if (!key || key.Application.id !== appId) {
			return c.json({ success: false, message: 'Key not found' }, 404);
		}

		if (!key.enabled) {
			return c.json({ success: false, message: 'Key is disabled' }, 403);
		}

		if (key.expires && key.expires < Date.now()) {
			return c.json({ success: false, message: 'Key has expired' }, 403);
		}

		return c.json({ success: true, message: 'Key is valid' });
	} catch (error) {
		console.error('Unexpected error:', error);
		return c.json({ success: false, message: 'Internal server error' }, 500);
	}
});

//? Retrieve a key by ID
app.get('/:keyId', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	try {
		const appId = c.req.param('appId');
		const keyId = c.req.param('keyId');
		const accID = c.req.param('accId');
		const key = await prisma.key.findUnique({
			where: { id: keyId, accId: accID },
			include: { Application: true },
		});
		if (!key || key.Application.id !== appId) {
			return c.json({ success: true, message: 'Key not found,', data: [] }, 404);
		}
		const id = c.env.REMAINING.idFromName(key.value);
		const bucket = c.env.REMAINING.get(id);
		const response = await bucket.fetch(new Request(`https://remainer?key=${key.value}&get=true`));
		const jsonResponse: { remaining: number } = await response.json();
		key.remaining = jsonResponse.remaining;
		key.refill = JSON.parse(key.refill!);
		key.ratelimit = JSON.parse(key.ratelimit!);
		key.Application.ratelimit = JSON.parse(key.Application.ratelimit!);
		key.Application.refill = JSON.parse(key.Application.refill!);
		return c.json({ success: true, message: '', data: [key] });
	} catch (error) {
		console.error('Unexpected error:', error);
		return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
	}
});

//? Retrieve keys by appId
app.get('', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const appId = c.req.param('appId');
		const accID = c.req.param('accId');
		// Check if the appId exists
		const application = await prisma.application.findUnique({
			where: { id: appId },
		});

		if (!application) {
			return c.json({ error: 'Application not found' }, 404);
		}

		// Retrieve all keys associated with the appId
		const keys = await prisma.key.findMany({
			where: { appId: appId, accId: accID },
			select: {
				id: true,
				appId: true,
				value: true,
				enabled: true,
			},
		});

		return c.json({ success: true, message: keys });
	} catch (error) {
		console.error('Error retrieving keys:', error);
		return c.json({ success: false, message: 'Internal server error' }, 500);
	}
});

//? Update a key
app.post('/:keyId', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const appId = c.req.param('appId');
		const keyId = c.req.param('keyId');
		const { value, environment, expires, metadata, ratelimit, refill } = await c.req.json();

		const key = await prisma.key.findUnique({
			where: { id: keyId },
			include: { Application: true },
		});

		if (!key || key.Application.id !== appId) {
			return c.json({ success: false, message: 'Key not found' }, 404);
		}

		const updatedKey = await prisma.key.update({
			where: { id: keyId },
			data: {
				value,
				environment,
				expires,
				metadata,
				ratelimit,
				refill,
			},
		});

		return c.json({ success: true, message: updatedKey });
	} catch (error) {
		if (error instanceof SyntaxError) {
			return c.json({ success: false, message: 'Invalid JSON syntax' }, 400);
		} else if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error' }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error' }, 500);
		}
	}
});

//? Update a key's remaining limit
app.put('/:keyId/refill', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const appId = c.req.param('appId');
		const keyId = c.req.param('keyId');
		const accID = c.req.param('accId');

		const { refill } = await c.req.json();

		const key = await prisma.key.findUnique({
			where: { id: keyId, accId: accID, appId: appId },
			include: { Application: true },
		});

		if (!key || key.Application.id !== appId) {
			return c.json({ success: true, message: 'Key not found', data: [] }, 404);
		}

		const updatedKey = await prisma.key.update({
			where: { id: keyId, accId: accID, appId: appId },
			data: {
				remaining: refill,
			},
		});

		return c.json({ success: true, message: '', data: [updatedKey] });
	} catch (error) {
		if (error instanceof SyntaxError) {
			return c.json({ success: false, message: 'Invalid JSON syntax' }, 400);
		} else if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error' }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error' }, 500);
		}
	}
});

//? Delete a key
app.delete('/:keyId/delete', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const appId = c.req.param('appId');
		const keyId = c.req.param('keyId');
		const accID = c.req.param('accId');

		const key = await prisma.key.findUnique({
			where: { id: keyId, accId: accID, appId: appId },
			include: { Application: true },
		});

		if (!key || key.Application.id !== appId) {
			return c.json({ success: true, message: 'Key not found', data: [] }, 404);
		}

		await prisma.key.delete({ where: { id: keyId } });

		return c.json({ success: true, message: 'Key deleted successfully', data: [] });
	} catch (error) {
		console.error('Unexpected error:', error);
		return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
	}
});

//* Retrieve usage numbers
app.get('/:keyId/usage', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const appId = c.req.param('appId');
		const keyId = c.req.param('keyId');

		const key = await prisma.key.findUnique({
			where: { id: keyId },
			include: { Application: true },
		});

		if (!key || key.Application.id !== appId) {
			return c.json({ success: false, message: 'Key not found' }, 404);
		}

		// Retrieve usage numbers from the database or any other tracking mechanism
		const usage = {
			// Placeholder data, replace with actual usage numbers
			total: 1000,
			remaining: key.remaining,
			consumed: 1000 - key.remaining!,
		};

		return c.json({ success: true, message: usage });
	} catch (error) {
		console.error('Unexpected error:', error);
		return c.json({ success: false, message: 'Internal server error' }, 500);
	}
});

export default app;
