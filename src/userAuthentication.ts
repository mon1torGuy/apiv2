import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, generateAPIKey, hashPassword, RequestKeySchema } from './utils';
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
app.post('/login', async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const email = c.req.query('email');
		const password = c.req.query('password');

		if (!email || !password) {
			return c.json({ success: true, message: 'Missing email or password', data: [] }, 400);
		}

		const userCheck = await prisma.user.findUnique({
			where: { email: email },
		});

		if (userCheck) {
			return c.json({ success: true, message: 'User already exists', data: [] }, 400);
		}
		const userPendingCheck = await prisma.userPending.findUnique({
			where: { email: email },
		});

		if (userPendingCheck && userPendingCheck.updatedAt < new Date(Date.now() - 1000 * 60 * 60 * 24)) {
			return c.json({ success: true, message: 'User already exists and invitation is expired', data: [] }, 400);
		}

		if (userPendingCheck && userPendingCheck.updatedAt > new Date(Date.now() - 1000 * 60 * 60 * 24)) {
			return c.json({ success: true, message: 'User already exists and invitation is valid', data: [] }, 400);
		}

		const hash = await hashPassword(password);
		console.log(hash);

		const userPending = await prisma.userPending.create({
			data: {
				email: email,
				password: password,
			},
		});

		await fetch('https://api.postmarkapp.com/email/withTemplate', {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'X-Postmark-Server-Token': '684fa8ef-2acb-452d-a2ca-6af9e071381e',
			},
			body: JSON.stringify({
				From: 'pablo@typeauth.com',
				To: primary_email,
				TemplateAlias: 'welcome',
				TemplateId: '35756681',
				TemplateModel: {
					product_url: 'https://www.typeauth.com',
					name: user_name,
					help_url: 'https://docs.typeauth.com',
					sender_name: 'Pablo',
				},
			}),
		});
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
