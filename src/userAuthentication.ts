import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, generateAPIKey, generateToken, hashPassword, RequestKeySchema } from './utils';
import { createPrismaClient } from './prisma';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';
import { uniqueNamesGenerator, Config, adjectives, colors } from 'unique-names-generator';
const customConfig: Config = {
	dictionaries: [adjectives, colors],
	separator: '-',
	length: 2,
};
type Bindings = {
	account_keys: KVNamespace;
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

//? Create a user signup
app.post('/signup', authMiddleware, async (c) => {
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
		const token = generateToken();

		const userPending = await prisma.userPending.create({
			data: {
				email: email,
				password: hash,
				token: token,
			},
		});

		if (!userPending) {
			return c.json({ success: true, message: 'User creation failed on DB', data: [] }, 400);
		}

		await fetch('https://api.postmarkapp.com/email/withTemplate', {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'X-Postmark-Server-Token': '684fa8ef-2acb-452d-a2ca-6af9e071381e',
			},
			body: JSON.stringify({
				From: 'pablo@typeauth.com',
				To: email,
				TemplateAlias: 'signup',
				TemplateModel: {
					email: email,
					token: token,
				},
			}),
		});

		return c.json({ success: true, message: 'Validation created successfully', data: [] }, 200);
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

//? Verify a user signup
app.post('/email/verify', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { code, token, email } = await c.req.json();

		if (!code || !token) {
			return c.json({ success: true, message: 'Missing code or token', data: [] }, 400);
		}

		if (code !== token) {
			return c.json({ success: true, message: 'Code and token do not match', data: [] }, 400);
		}

		const user = await prisma.userPending.findUnique({
			where: { email: email, token: token },
		});

		if (!user) {
			return c.json({ success: true, message: 'User not found', data: [] }, 400);
		}
		if (user.verified) {
			return c.json({ success: true, message: 'User already verified', data: [] }, 400);
		}
		if (user.token !== token) {
			return c.json({ success: true, message: 'Code and token do not match', data: [] }, 400);
		}
		const apiKeyUser = 'th_u_' + generateAPIKey(64);
		const accountName = uniqueNamesGenerator(customConfig);
		const apiKeyMaster = 'th_m_' + generateAPIKey(64);

		const userCreated = await prisma.user.create({
			data: {
				email: email,
				name: '',
				apiKey: apiKeyUser,
				avatar: '',
				password: user.password,
			},
		});

		const account = await prisma.account.create({
			data: {
				name: accountName,
				plan: 'free',
				period: '',
				primary_email: email,
				subscription_id: '',
				apiKey: apiKeyMaster,
				subscription_email: email,
			},
		});

		await c.env.account_keys.put(apiKeyUser, JSON.stringify(userCreated));
		const accountUser = await prisma.accountUser.create({
			data: {
				account: {
					connect: {
						id: account.id,
					},
				},
				user: {
					connect: {
						id: userCreated.id,
					},
				},
				email: email,
				role: 'admin',
				name: accountName,
			},
		});

		await prisma.userPending.delete({
			where: { email: email, token: token },
		});
		return c.json({ success: true, message: 'User verified successfully', data: [accountUser] }, 200);
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
