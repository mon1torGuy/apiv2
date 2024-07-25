//? Create a monitor
import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, isValidHttpUrl, RequestMonitorDashSchema, RequestMonitorUpdateSchema } from './utils';
import { createPrismaClient } from './prisma';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';

type Bindings = {
	SENTRY_DSN: string;
	DB: D1Database;
	ACCOUNT_ID: string;
	API_TOKEN: string;
	MONITOR: AnalyticsEngineDataset;
};
const app = new Hono<{ Bindings: Bindings }>();
app.use('*', sentry());
app.use('*', cors());

app.post('/create', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const accId = c.req.param('accId');
		const requestJSONBody = await c.req.json();
		const result = RequestMonitorDashSchema.safeParse(requestJSONBody);
		if (!result.success) {
			return c.json(
				{
					success: false,
					message: 'Invalid request body',
					errors: result.error.format(),
					data: [],
				},
				400
			);
		}

		const isOKURL = isValidHttpUrl(result.data.url);
		if (!isOKURL) {
			return c.json({ success: true, message: 'URL must be valid', data: [] }, 400);
		}
		const httpMonitors = await prisma.httpmonitor.create({
			data: {
				name: result.data.name ?? '',
				url: result.data.url,
				checks_down: 2,
				checks_up: 2,
				interval: 300,
				ssl_verify: true,
				req_headers: '',
				req_timeout: 60,
				follow_redir: true,
				status_code: result.data.status_code ?? 200,
				method: 'GET',
				account: { connect: { id: accId } },
			},
		});

		const formattedMonitor = {
			id: httpMonitors.id,
			name: httpMonitors.name,
			status_code: httpMonitors.status_code,
			createdAt: httpMonitors.createdAt,
			updatedAt: httpMonitors.updatedAt,
			url: httpMonitors.url,
			mon_status: httpMonitors.mon_status,
		};
		return c.json({ success: true, message: '', data: [formattedMonitor] }, 200);
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

app.get('', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const accId = c.req.param('accId');
		const id = c.req.query('id');

		if (id) {
			const monitor = await prisma.httpmonitor.findUnique({
				where: { id: id, accId: accId },
				select: {
					name: true,
					status_code: true,
					url: true,
					createdAt: true,
					updatedAt: true,
					mon_status: true,
				},
			});

			if (!monitor) {
				return c.json({ success: true, message: 'Monitor not found', data: [] }, 404);
			}
			const monitorstats = `SELECT timestamp AS time, double1 as latency, blob3 as statusCode FROM monitor WHERE blob2 = '${id}' AND  timestamp > NOW() - INTERVAL '1' DAY GROUP BY time, latency, statusCode ORDER BY time ASC;`;
			const API = `https://api.cloudflare.com/client/v4/accounts/${c.env.ACCOUNT_ID}/analytics_engine/sql`;
			const queryResponse = await fetch(API, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${c.env.API_TOKEN}`,
				},
				body: monitorstats,
			});
			if (queryResponse.status != 200) {
				return c.json({ success: false, message: 'An error occurred!', data: [] }, 500);
			}
			const queryResponseJSON = await queryResponse.json();
			//@ts-expect-error

			return c.json({ success: true, message: '', data: { monitor: monitor, data: queryResponseJSON.data } }, 200);
		}

		const monitorsHttp = await prisma.httpmonitor.findMany({
			where: {
				accId: accId,
			},
		});

		if (monitorsHttp.length === 0) {
			return c.json({ success: true, message: 'Monitors not found', data: [] }, 404);
		}
		const formattedMonitor = monitorsHttp.map((monitor) => ({
			id: monitor.id,
			name: monitor.name,
			status_code: monitor.status_code,
			createdAt: monitor.createdAt,
			updatedAt: monitor.updatedAt,
			url: monitor.url,
			mon_status: monitor.mon_status,
		}));

		return c.json({ success: true, message: '', data: formattedMonitor }, 200);
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
//? Update
app.put('/:monitorId', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const accId = c.req.param('accId');
		const monitorId = c.req.param('monitorId');
		const requestJSONBody = await c.req.json();
		const result = RequestMonitorUpdateSchema.safeParse(requestJSONBody);
		console.log(JSON.stringify(result?.error?.format()));
		if (!result.success) {
			return c.json(
				{
					success: false,
					message: 'Invalid request body',
					errors: result.error.format(),
					data: [],
				},
				400
			);
		}
		if (!accId || !monitorId) {
			return c.json({ success: true, message: 'Path paremeters missing', data: [] });
		}

		const monitor = await prisma.httpmonitor.findUnique({
			where: { id: monitorId, accId: accId },
		});

		if (!monitor || monitor.accId !== accId) {
			return c.json({ success: false, message: 'Monitor not found' }, 404);
		}

		const updatedMonitor = await prisma.httpmonitor.update({
			where: { id: monitorId },
			data: {
				name: result.data.name,
				url: result.data.url,
				mon_status: result.data.mon_status ? true : false,
				status_code: result.data.status_code,
			},
		});

		const formattedMonitor = {
			id: updatedMonitor.id,
			name: updatedMonitor.name,
			status_code: updatedMonitor.status_code,
			createdAt: updatedMonitor.createdAt,
			updatedAt: updatedMonitor.updatedAt,
			url: updatedMonitor.url,
			mon_status: updatedMonitor.mon_status,
		};
		return c.json({ success: true, message: '', data: [formattedMonitor] }, 200);
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
//?Delete
app.delete('/:monitorId', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	try {
		const accId = c.req.param('accId');
		const monitorId = c.req.param('monitorId');

		if (!accId || !monitorId) {
			return c.json({ success: true, message: 'Query paremeters missing', data: [] }, 401);
		}

		await prisma.httpmonitor.delete({
			where: { id: monitorId, accId: accId },
		});

		return c.json({ success: true, message: 'HTTP monitor deleted susccesfully', data: [] }, 200);
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

export default app;
