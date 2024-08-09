import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createPrismaClient } from './prisma';
import { bearerAuth } from 'hono/bearer-auth';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';
import { generateToken } from './utils';
import { use } from 'hono/jsx';
interface ResponseData {
	time: string;
	application: string;
	requests: string;
}

interface AggregatedData {
	time: string;
	[application: string]: number | string;
}

type Bindings = {
	account_keys: KVNamespace;
	SENTRY_DSN: string;
	DB: D1Database;
	ACCOUNT_ID: string;
	member_invitations: KVNamespace;
	API_TOKEN: string;
	ANALYTICS: AnalyticsEngineDataset;
};
const app = new Hono<{ Bindings: Bindings }>();
const token = 'kQKxubkN2RlmAULBl5Vr-f9fSNr832rNX';

app.use('*', sentry());
app.use('*', cors());

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
		const queryKeysHourly = `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS time, blob5 as application, COUNT() AS requests FROM analytics WHERE  blob1 = '${accID}' AND  timestamp > NOW() - INTERVAL '1' DAY GROUP BY time, application ORDER BY time ASC;`;
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

		const aggregateRequestsByTime = (data: ResponseData[]): AggregatedData[] => {
			const aggregationMap: { [time: string]: AggregatedData } = {};

			data.forEach(({ time, application, requests }) => {
				if (!aggregationMap[time]) {
					aggregationMap[time] = { time };
				}
				//@ts-expect-error
				aggregationMap[time][application] = (aggregationMap[time][application] || 0) + parseInt(requests, 10);
			});

			return Object.values(aggregationMap);
		};
		//@ts-expect-error
		const aggregatedData = aggregateRequestsByTime(queryResponse1JSON.data);

		return c.json(
			{
				success: true,
				message: '',
				data: {
					keyCount: keyCount,
					appCount: appCount,
					//@ts-expect-error
					authentications: queryResponseJSON.data[0].requests,
					analyticsHourly: aggregatedData,
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
app.post('/:accId/account/addmember', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accID = c.req.param('accId');
	const { email, role, from_email } = await c.req.json();
	if (!accID || !email || !role || !from_email) {
		return c.json({ success: true, message: 'Missing parameters', data: [] }, 400);
	}
	try {
		const checkifUserexist = await prisma.user.findUnique({
			where: { email: email },
		});
		const accountName = await prisma.account.findUnique({
			where: { id: accID },
			select: { name: true },
		});
		if (checkifUserexist) {
			const checkAccount = await prisma.accountUser.findMany({
				where: { email: email },
			});
			if (checkAccount.find((account) => account.accId === accID)) {
				return c.json({ success: true, message: 'User already exist in this account', data: [] }, 400);
			} else {
				const token = generateToken(20);
				await c.env.member_invitations.put(
					token,
					JSON.stringify({ email, role, accID, userExist: true, userID: checkifUserexist.id, account_name: accountName!.name }),
					{
						expirationTtl: 60 * 60 * 24 * 7,
					}
				);
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
						TemplateAlias: 'user-invitation',
						TemplateModel: {
							email: email,
							token: token,
							from_email: from_email,
						},
					}),
				});
				return c.json({ success: true, message: 'Invitation sent successfully', data: [] }, 200);
			}
		} else {
			const token = generateToken(20);
			await c.env.member_invitations.put(token, JSON.stringify({ email, role, accID, userExist: false, account_name: accountName!.name }), {
				expirationTtl: 60 * 60 * 24 * 7,
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
					TemplateAlias: 'user-invitation',
					TemplateModel: {
						email: email,
						token: token,
						from_email: from_email,
					},
				}),
			});

			return c.json({ success: true, message: 'Invitation sent successfully', data: [] }, 200);
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
//? Delete account member
app.delete('/:accId/account/member', bearerAuth({ token }), async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accID = c.req.param('accId');
	const email = c.req.query('email');
	const userID = c.req.query('userID');

	if (!accID || !email || !userID) {
		return c.json({ success: true, message: 'Missing parameters', data: [] }, 400);
	}
	try {
		await prisma.accountUser.deleteMany({
			where: { accId: accID, email: email, userId: userID },
		});
		//Check if the user is in other accounts
		const existonOtherAccount = await prisma.accountUser.findMany({
			where: {
				email: email,
				userId: userID, // Replace with the desired user email
			},
		});
		// If is not in other accounts, delete the user
		if (!existonOtherAccount || existonOtherAccount.length === 0) {
			await prisma.user.delete({
				where: { id: userID },
			});
			return c.json({ success: true, message: 'User deleted successfully', data: [] }, 200);
		}

		return c.json({ success: true, message: 'User deleted successfully', data: [] }, 200);
	} catch (error) {
		if (error instanceof PrismaClientKnownRequestError) {
			//@ts-expect-error
			if (error.meta.cause === 'Record to delete does not exist.') {
				return c.json({ success: true, message: 'Member already deleted', data: [] }, 500);
			}
			// Prisma database error
			console.error('Prisma database error:', error);
			return c.json({ success: true, message: error, data: [] }, 500);
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

export default app;
