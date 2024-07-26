import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createPrismaClient } from './prisma';
import { bearerAuth } from 'hono/bearer-auth';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';
import { uniqueNamesGenerator, Config, adjectives, colors } from 'unique-names-generator';
import { generateAPIKey } from './utils';

interface JWKsType {
	kty: string;
	use: string;
	crv: string;
	kid: string;
	x: string;
	y: string;
	alg: string;
}
type Bindings = {
	account_keys: KVNamespace;
	SENTRY_DSN: string;
	DB: D1Database;
	ACCOUNT_ID: string;
	API_TOKEN: string;
	ANALYTICS: AnalyticsEngineDataset;
};
const app = new Hono<{ Bindings: Bindings }>();
const token = 'kQKxubkN2RlmAULBl5Vr-f9fSNr832rNX';
const customConfig: Config = {
	dictionaries: [adjectives, colors],
	separator: '-',
	length: 2,
};
app.use('*', sentry());
app.use('*', cors());

app.post('/account', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const isInvite = c.req.query('invite');
	try {
		const {
			plan = 'free',
			primary_email,
			subscription_id = '',
			subscription_email = '',
			accInv = '',
			role = '',
			clerkId,
			period = '',
			user_name = '',
			avatar = '',
		} = await c.req.json();

		if (isInvite) {
			const user = await prisma.user.create({
				data: {
					email: primary_email,
					name: user_name,
					avatar: avatar,
				},
			});

			const accounInfo = await prisma.account.findUnique({
				where: { id: accInv },
				select: { name: true },
			});

			await prisma.accountUser.create({
				data: {
					account: {
						connect: {
							id: accInv,
						},
					},
					user: {
						connect: {
							id: user.id,
						},
					},
					email: primary_email,
					role: role,
					name: accounInfo?.name ?? '',
				},
			});
		}

		const isExistingUser = await prisma.user.findFirst({
			where: {
				email: primary_email, // Replace with the desired user email
			},
			include: {
				accounts: true,
			},
		});
		if (!isExistingUser) {
			const accountName = uniqueNamesGenerator(customConfig);
			const apiKeyMaster = 'th_m_' + generateAPIKey(64);

			const account = await prisma.account.create({
				data: {
					name: accountName,
					plan,
					period,
					primary_email,
					subscription_id,
					clerkId,
					apiKey: apiKeyMaster,
					subscription_email,
				},
			});
			const apiKeyUser = 'th_u_' + generateAPIKey(64);

			const user = await prisma.user.create({
				data: {
					email: primary_email,
					name: user_name,
					avatar: avatar,
					apiKey: apiKeyUser,
				},
			});
			await c.env.account_keys.put(apiKeyUser, JSON.stringify(user));
			await prisma.accountUser.create({
				data: {
					account: {
						connect: {
							id: account.id,
						},
					},
					user: {
						connect: {
							id: user.id,
						},
					},
					email: primary_email,
					role: 'admin',
					name: accountName,
				},
			});

			const dataUser = await prisma.user.findFirst({
				where: {
					email: primary_email, // Replace with the desired user email
				},
				include: {
					accounts: true,
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

			return c.json({ success: true, message: '', data: dataUser }, 201);
		}

		return c.json({ success: true, message: '', data: isExistingUser }, 200);
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

app.post('/feedback', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	try {
		const { name, description = '' } = await c.req.json();

		const addFeedback = await prisma.feedback.create({
			data: {
				name,
				description,
				upvote: 1,
				status: 'backlog',
			},
		});

		return c.json({ success: true, message: '', data: addFeedback }, 201);
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
app.put('/feedback', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	try {
		const { id, upvote } = await c.req.json();

		const addFeedback = await prisma.feedback.update({
			where: { id: id },
			data: {
				upvote: parseInt(upvote) + 1,
			},
		});

		return c.json({ success: true, message: '', data: addFeedback }, 200);
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

//! Account
//? Dashboard statistics
app.get('/:accId/account', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accID = c.req.param('accId');
	if (!accID || accID === 'null') return c.json({ success: true, message: 'No Account provided', data: [] }, 400);
	try {
		const accID = c.req.param('accId');
		const keyCount = await prisma.key.count({
			where: {
				accId: accID,
			},
		});
		const appCount = await prisma.application.count({
			where: {
				accId: accID,
			},
		});
		const queryKeysHourly = `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS time, COUNT() AS requests FROM analytics WHERE  blob1 = '${accID}' AND  timestamp > NOW() - INTERVAL '1' DAY GROUP BY time ORDER BY time ASC;`;
		const authentications = `SELECT COUNT() AS requests FROM analytics WHERE  blob1 = '${accID}' AND  timestamp > NOW() - INTERVAL '1' MONTH;`;
		const topApplicationsUsage = `SELECT count() as count, blob5 as application FROM analytics WHERE blob1 = '${accID}' GROUP BY application;`;
		const API = `https://api.cloudflare.com/client/v4/accounts/${c.env.ACCOUNT_ID}/analytics_engine/sql`;
		const queryResponse = await fetch(API, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${c.env.API_TOKEN}`,
			},
			body: authentications,
		});
		const queryResponse1 = await fetch(API, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${c.env.API_TOKEN}`,
			},
			body: queryKeysHourly,
		});
		const queryResponse2 = await fetch(API, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${c.env.API_TOKEN}`,
			},
			body: topApplicationsUsage,
		});

		if (queryResponse.status != 200 || queryResponse1.status != 200 || queryResponse2.status != 200) {
			console.error('Error querying:', await queryResponse.text());
			return c.json({ success: false, message: 'An error occurred!', data: [] }, 500);
		}
		const queryResponseJSON = await queryResponse.json();
		const queryResponse1JSON = await queryResponse1.json();
		const queryResponse2JSON = await queryResponse2.json();

		return c.json(
			{
				success: true,
				message: '',
				data: {
					keyCount: keyCount,
					appCount: appCount,
					//@ts-expect-error
					authentications: queryResponseJSON.data[0].requests,
					//@ts-expect-error
					analyticsHourly: queryResponse1JSON.data,
					//@ts-expect-error
					topApplicationUsage: queryResponse2JSON.data,
				},
			},
			200
		);
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
//? Update account name
app.post('/:accId/account/name', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accID = c.req.param('accId');
	const { name } = await c.req.json();
	try {
		const updateAccName = await prisma.account.update({
			where: { id: accID },
			data: {
				name,
			},
		});

		return c.json({ success: true, message: '', data: updateAccName }, 200);
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
//? Delete account member
app.delete('/:accId/account/member', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accID = c.req.param('accId');
	const email = c.req.query('email');
	try {
		await prisma.accountUser.delete({
			where: { id: accID, email: email },
		});

		const isSingleAccount = await prisma.accountUser.findMany({
			where: {
				email: email, // Replace with the desired user email
			},
		});

		if (isSingleAccount.length > 0) {
			return c.json({ success: true, message: 'delete', data: [] }, 400);
		}

		return c.json({ success: true, message: 'ok', data: [] }, 400);
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
//? Get Account info
app.get('/:accId/account/info', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accID = c.req.param('accId');
	if (!accID || accID === 'null') return c.json({ success: true, message: 'No Account provided', data: [] }, 400);
	try {
		const accountUsers = await prisma.account.findUnique({
			where: {
				id: accID,
			},
			include: {
				accountuser: {
					include: {
						user: true,
					},
				},
			},
		});

		const authentications = `SELECT COUNT() AS requests FROM analytics WHERE  blob1 = '${accID}' AND  timestamp > NOW() - INTERVAL '1' MONTH;`;
		const API = `https://api.cloudflare.com/client/v4/accounts/${c.env.ACCOUNT_ID}/analytics_engine/sql`;
		const queryResponse = await fetch(API, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${c.env.API_TOKEN}`,
			},
			body: authentications,
		});

		if (queryResponse.status != 200) {
			console.error('Error querying:', await queryResponse.text());
			return c.json({ success: false, message: 'An error occurred!', data: [] }, 500);
		}
		const queryResponseJSON = await queryResponse.json();

		return c.json(
			{
				success: true,
				message: '',
				data: {
					...accountUsers,
					//@ts-expect-error
					authentications: queryResponseJSON.data[0].requests,
				},
			},
			200
		);
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
//? Is  needed?????
app.post('/account/info', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	try {
		const { email } = await c.req.json();
		const user = await prisma.user.findUnique({
			where: { email: email },
		});
		if (!user) {
			return c.json({ success: true, message: 'User not found', data: [] });
		}
		const account = await prisma.accountUser.findMany({
			where: { userId: user?.id },
		});
		return c.json({ success: true, message: '', data: account }, 201);
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
//? Account Settings
app.get('/:accId/settings', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accId = c.req.param('accId');
	try {
		const account = await prisma.account.findUnique({
			where: {
				id: accId,
			},
			include: {
				accountuser: {
					include: {
						user: true,
					},
				},
			},
		});

		if (!account) {
			return c.json({ success: true, message: 'No account found', data: [] }, 404);
		}

		return c.json({ succces: true, message: '', data: account });
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
//! Feedback
app.get('/feedback', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	try {
		const addFeedback = await prisma.feedback.findMany();

		return c.json({ success: true, message: '', data: addFeedback }, 200);
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

export default app;
