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
	refresh_token_users: KVNamespace;
	typeauth_keys: KVNamespace;
	refill_timestamp: KVNamespace;
	SENTRY_DSN: string;
	DB: D1Database;
	RATE_LIMITER: DurableObjectNamespace;
	REMAINING: DurableObjectNamespace;
	webauthn: KVNamespace;
	member_invitations: KVNamespace;
};
const app = new Hono<{ Bindings: Bindings }>();
app.use('*', sentry());
app.use('*', cors());

//? Create a user signup
app.post('/refresh', authMiddleware, async (c) => {
	try {
		const token = c.req.query('token');

		if (!token) {
			return c.json({ success: true, message: 'Missing token', data: [] }, 400);
		}

		const tokenInformation = await c.env.refresh_token_users.get(token, { type: 'json' });

		if (!tokenInformation) {
			return c.json({ success: true, message: 'Invalid token', data: [] }, 400);
		}
		console.log(tokenInformation);

		const refresh_token = generateToken(30);
		await c.env.refresh_token_users.put(refresh_token, JSON.stringify(tokenInformation), { expirationTtl: 60 * 60 * 24 * 90 });
		await c.env.refresh_token_users.delete(token);
		return c.json(
			{ success: true, message: 'Token refreshed successfully', data: { token: tokenInformation, refresh: refresh_token } },
			200
		);
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
		const refresh_token = generateToken(30);
		await c.env.refresh_token_users.put(refresh_token, JSON.stringify(accountInfo), { expirationTtl: 60 * 60 * 24 * 90 });

		return c.json({ success: true, message: 'User found successfully', data: { userInfor: accountInfo, refresh: refresh_token } }, 200);
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
		const { code, password } = await c.req.json();

		if (!code || !password) {
			return c.json({ success: true, message: 'Missing password or token', data: [] }, 400);
		}

		const userForgot = await prisma.userForgot.findUnique({
			where: { token: code },
			include: { user: true },
		});
		if (!userForgot) {
			return c.json({ success: true, message: 'Invalid token. Please check your credentials and try again.', data: [] }, 400);
		}
		const hash = await hashPassword(password);
		await prisma.user.update({
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
		await prisma.userForgot.delete({
			where: { token: code },
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
		const refresh_token = generateToken(30);

		await c.env.refresh_token_users.put(refresh_token, JSON.stringify(accountUser), { expirationTtl: 60 * 60 * 24 * 90 });
		//@ts-expect-error
		accountUser.refresh = refresh_token;
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
//? Verify a member invitation
app.post('/email/member/verify', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { code, token, email } = await c.req.json();

		if (!code || !token || !email) {
			return c.json({ success: true, message: 'Missing code or token or email', data: [] }, 400);
		}

		if (code !== token) {
			return c.json({ success: true, message: 'Code and token do not match', data: [] }, 400);
		}

		const user = (await c.env.member_invitations.get(token, { type: 'json' })) as {
			email: string;
			role: string;
			accID: string;
			userExist: boolean;
			userID?: string;
			account_name?: string;
		} | null;

		if (!user) {
			return c.json({ success: true, message: 'User not found', data: [] }, 400);
		}

		if (user.userExist) {
			const account = await prisma.accountUser.create({
				data: {
					account: {
						connect: {
							id: user.accID,
						},
					},
					user: {
						connect: {
							id: user.userID,
						},
					},
					email: email,
					role: user.role,
					name: user.account_name ?? '',
				},
			});

			const apiKeyUser = 'th_u_' + generateAPIKey(64);

			await c.env.account_keys.put(apiKeyUser, JSON.stringify(account));
			return c.json({ success: true, message: 'User verified successfully', data: [] }, 200);
		} else {
			const apiKeyUser = 'th_u_' + generateAPIKey(64);

			const userCreated = await prisma.user.create({
				data: {
					email: email,
					name: '',
					apiKey: apiKeyUser,
					avatar: '',
					password: 'Pending creation',
				},
			});

			const accountUser = await prisma.accountUser.create({
				data: {
					account: {
						connect: {
							id: user.accID,
						},
					},
					user: {
						connect: {
							id: userCreated.id,
						},
					},
					email: email,
					role: user.role,
					name: user.account_name ?? '',
				},
			});
			await c.env.account_keys.put(apiKeyUser, JSON.stringify(accountUser));
			return c.json({ success: true, message: 'User verified and created successfully', data: [] }, 200);
		}
	} catch (error) {
		if (error instanceof SyntaxError) {
			return c.json({ success: false, message: 'Invalid JSON syntax' }, 400);
		} else if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: error }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error' }, 500);
		}
	}
});
//? Verify a member invitation
app.post('/email/member/verify/pass', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { email, password, confirm_password } = await c.req.json();

		if (!email || !password || !confirm_password) {
			return c.json({ success: true, message: 'Missing email, password or confirm password', data: [] }, 400);
		}

		const user = await prisma.user.findUnique({
			where: { email: email },
		});

		if (user?.password !== 'Pending creation') {
			return c.json({ success: true, message: 'User already exists', data: [] }, 400);
		}
		if (!user) {
			return c.json({ success: true, message: 'User not found', data: [] }, 400);
		}

		if (password !== confirm_password) {
			return c.json({ success: true, message: 'Passwords do not match', data: [] }, 400);
		}
		const hash = await hashPassword(password);
		const updateUser = await prisma.user.update({
			where: { email: email },
			data: {
				password: hash,
			},
		});

		if (updateUser) {
			return c.json({ success: true, message: 'User Password updated successfully', data: [] }, 200);
		}
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
//? Verify a user signup
app.post('/webauth/user', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { email } = c.req.query();

		if (!email) {
			return c.json({ success: true, message: 'Missing email', data: [] }, 400);
		}

		const user = await prisma.user.findUnique({
			where: { email: email },
		});

		if (!user) {
			return c.json({ success: true, message: 'User not found', data: [] }, 400);
		}

		if (!user.ispasskey) {
			return c.json({ success: true, message: 'Passkey not registered for this user', data: [] }, 400);
		}

		return c.json({ success: true, message: 'User verified successfully', data: user }, 200);
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error' }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error' }, 500);
		}
	}
});

app.get('/webauth/login/verification', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const email = c.req.query('email');

		if (!email) {
			return c.json({ success: true, message: 'Email is required', data: [] }, 400);
		}

		const user = await prisma.user.findUnique({
			where: { email: email },
		});
		if (!user) {
			return c.json({ success: true, message: 'User not found', data: [] }, 400);
		}

		const accountInfo = await prisma.accountUser.findMany({
			where: { userId: user.id, email: user.email },
		});
		const refresh_token = generateToken(30);
		await c.env.refresh_token_users.put(refresh_token, JSON.stringify(accountInfo), { expirationTtl: 60 * 60 * 24 * 90 });

		return c.json({ success: true, message: 'User found successfully', data: { userInfor: accountInfo, refresh: refresh_token } }, 200);
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
//? Save Webauthn Challenge
app.post('/webauth/challenge', authMiddleware, async (c) => {
	try {
		const { email, challenge } = c.req.query();

		if (!email || !challenge) {
			return c.json({ success: true, message: 'Missing 	email or challenge', data: [] }, 400);
		}

		await c.env.webauthn.put(email, challenge, { expirationTtl: 60 * 60 });

		return c.json({ success: true, message: 'Challenge saved successfully', data: [] }, 200);
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error' }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error' }, 500);
		}
	}
});

//? Get Webauthn Challenge
app.get('/webauth/challenge', authMiddleware, async (c) => {
	try {
		const { email } = c.req.query();

		if (!email) {
			return c.json({ success: true, message: 'Missing 	email', data: [] }, 400);
		}

		const challenge = await c.env.webauthn.get(email);

		return c.json({ success: true, message: 'Challenge retieved successfully', data: challenge }, 200);
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error' }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error' }, 500);
		}
	}
});
///webauthn/register/credential
//? Save the Registration Information
app.post('/webauthn/register/credential', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { email, credential } = await c.req.json();

		if (!email || !credential) {
			return c.json({ success: true, message: 'Missing email or credential', data: [] }, 400);
		}

		await prisma.user.update({
			where: { email: email },
			data: {
				webauthn_cred: JSON.stringify(credential),
				ispasskey: true,
			},
		});

		return c.json({ success: true, message: 'Credential saved successfully', data: [] }, 200);
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
//? Get the Registration Information
app.get('/webauthn/register/credential', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const { email } = await c.req.query();

		if (!email) {
			return c.json({ success: true, message: 'Missing email ', data: [] }, 400);
		}

		const user = await prisma.user.findUnique({
			where: { email: email, ispasskey: true },
		});

		if (!user) {
			return c.json({ success: true, message: 'Credential not found', data: [] }, 400);
		}
		return c.json({ success: true, message: 'Credential found successfully', data: user.webauthn_cred }, 200);
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error' }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error' }, 500);
		}
	}
});
export default app;
