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
		console.log(userCheck);
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

app.post('/login', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const email = c.req.query('email');
		const password = c.req.query('password');

		if (!email || !password) {
			return c.json({ success: true, message: 'Invalid email or password. Please check your credentials and try again', data: [] }, 400);
		}
		const hash = await hashPassword(password);

		const user = await prisma.user.findUnique({
			where: { email: email, password: hash },
		});
		if (!user) {
			return c.json({ success: true, message: 'Invalid email or password. Please check your credentials and try again.', data: [] }, 400);
		}

		const accountInfo = await prisma.accountUser.findMany({
			where: { userId: user.id, email: user.email },
		});

		return c.json({ success: true, message: 'User found successfully', data: accountInfo }, 200);
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
app.post('/forgot-password', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const email = c.req.query('email');

		if (!email) {
			return c.json({ success: true, message: 'Invalid email. Please check your credentials and try again', data: [] }, 400);
		}

		const user = await prisma.user.findUnique({
			where: { email: email },
		});
		if (!user) {
			return c.json({ success: true, message: 'Invalid email. Please check your credentials and try again.', data: [] }, 400);
		}
		const token = generateToken();
		await prisma.userForgot.create({
			data: {
				email,
				token,
				userId: user.id,
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
				To: email,
				TemplateAlias: 'password-reset',
				TemplateModel: {
					email: email,
					token: token,
				},
			}),
		});

		return c.json({ success: true, message: 'Password reset successfully', data: [] }, 200);
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

app.post('/reset-password', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { token, password } = await c.req.json();

		if (!token || !password) {
			return c.json({ success: true, message: 'Missing password or token', data: [] }, 400);
		}

		const userForgot = await prisma.userForgot.findUnique({
			where: { token: token },
			include: { user: true },
		});
		if (!userForgot) {
			return c.json({ success: true, message: 'Invalid token. Please check your credentials and try again.', data: [] }, 400);
		}
		const hash = await hashPassword(password);
		const userUpdate = await prisma.user.update({
			where: { id: userForgot.userId },
			data: { password: hash },
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
				To: userForgot.email,
				TemplateAlias: 'reset-confirmation',
				TemplateModel: {
					email: userForgot.email,
				},
			}),
		});

		return c.json({ success: true, message: 'Password reset successfully', data: [] }, 200);
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

export default app;
