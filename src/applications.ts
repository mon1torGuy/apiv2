import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, RequestApplicationSchema } from './utils';
import { createPrismaClient } from './prisma';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';

type Bindings = {
	app_jwt_keys: KVNamespace;
	SENTRY_DSN: string;
	DB: D1Database;
};
const app = new Hono<{ Bindings: Bindings }>();
app.use('*', sentry());
app.use('*', cors());

//? Create a new application
app.post('/create', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accId = c.req.param('accId');

	try {
		const requestJSONBody = await c.req.json();
		const result = RequestApplicationSchema.safeParse(requestJSONBody);
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

		const isNameTakenApplication = await prisma.application.findFirst({
			where: { accId: accId, name: result.data.name },
		});

		if (isNameTakenApplication) {
			return c.json({ success: true, message: "Application's name already exist.", data: [] }, 400);
		}

		const application = await prisma.application.create({
			data: {
				name: result.data.name,
				ratelimit: !result.data.ratelimit ? null : JSON.stringify(result.data.ratelimit),
				refill: !result.data.refill ? null : JSON.stringify(result.data.refill),
				remaining: result.data.remaining ?? null,
				keyType: result.data.keyType,
				jwk: result.data.jwk ?? null,
				expires: result.data.expires ?? 0,
				byteLength: result.data.byteLength ?? 32,
				description: result.data.description ?? '',
				prefix: result.data.prefix ?? '',
				account: {
					connect: {
						id: accId,
					},
				},
			},
		});

		if (result.data.keyType === 'jwt') {
			const key = await prisma.jwks.findUnique({ where: { id: result.data.jwk } });
			await c.env.app_jwt_keys.put(application.id, JSON.stringify(key?.jwk));
		}
		if (application.ratelimit != null) {
			application.ratelimit = JSON.parse(application.ratelimit);
		}
		if (application.refill != null) {
			application.refill = JSON.parse(application.refill);
		}
		return c.json({ success: true, message: '', data: [application] }, 201);
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
//? List all applications
app.get('', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accId = c.req.param('accId');
	console.log(JSON.stringify(c));
	try {
		const applications = await prisma.application.findMany({
			where: { accId: accId },
			include: {
				_count: {
					select: {
						appKeys: true,
					},
				},
			},
		});
		const formattedApplications = applications.map((application) => ({
			...application,
			ratelimit: application.ratelimit != null ? JSON.parse(application.ratelimit) : null,
			refill: application.refill != null ? JSON.parse(application.refill) : null,
			keyCount: application._count.appKeys,
			_count: undefined,
		}));
		if (applications.length === 0) {
			return c.json({ success: true, message: 'No applications found', data: [] }, 404);
		}

		return c.json({ succces: true, message: '', data: formattedApplications });
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
app.get('/:id', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	const id = c.req.param('id');
	const accID = c.req.param('accId');
	if (!id || !accID) {
		return c.json({ success: true, message: 'Account and ID missing', data: [] }, 401);
	}
	try {
		const application = await prisma.application.findUnique({
			where: { id: id, accId: accID },
			include: {
				_count: {
					select: {
						appKeys: true,
					},
				},
			},
		});
		if (!application) {
			return c.json({ success: true, message: 'Application not found', data: [] }, 404);
		}
        //@ts-expect-error
		application.keyCount = application._count.appKeys;
        //@ts-expect-error
		application._count = undefined;
		application.ratelimit = application.ratelimit != null ? JSON.parse(application.ratelimit) : null;
		application.refill = application.refill != null ? JSON.parse(application.refill) : null;

		return c.json({ success: true, message: '', data: [application] });
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
//? Update an application
app.put('/:id', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	const id = c.req.param('id');
	const accID = c.req.param('accId');
	try {
		const { name, description, prefix } = await c.req.json();
		const application = await prisma.application.update({
			where: { id: id, accId: accID },
			data: {
				name,
				description,
				prefix,
			},
		});
		if (!application) {
			return c.json({ success: true, message: 'Application not found', data: [] }, 404);
		}

		return c.json({ success: true, message: '', data: [application] });
	} catch (error) {
		if (error instanceof SyntaxError) {
			// JSON parsing error
			return c.json({ success: true, message: 'Invalid JSON syntax', data: [] }, 400);
		} else if (error instanceof PrismaClientKnownRequestError) {
			// Prisma database error
			console.error('Prisma database error:', error);
			//@ts-expect-error//@ts-expect-error
			if (error.meta.cause === 'Record to update not found.') {
				return c.json({ success: true, message: 'Account or Application not found', data: [] }, 404);
			}
			return c.json({ success: true, message: 'Database Error', data: [] }, 500);
		} else {
			// Other errors
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
		}
	}
});
//? Delete an application
app.delete('/:id', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);

	const id = c.req.param('id');
	const accID = c.req.param('accId');
	try {
		await prisma.application.delete({
			where: { id: id, accId: accID },
		});
		return c.json({ success: true, message: 'Application deleted successfully', data: [] });
	} catch (error) {
		//@ts-expect-error

		if (error.meta.cause === 'Record to update not found.') {
			return c.json({ success: true, message: 'Account or Application not found', data: [] }, 404);
		} else if (error instanceof PrismaClientKnownRequestError) {
			console.error('Prisma database error:', error);
			return c.json({ success: false, message: 'Database error', data: [] }, 500);
		} else {
			console.error('Unexpected error:', error);
			return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
		}
	}
});


export default app;
