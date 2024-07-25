import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, RequestJWKCreateSchema } from './utils';
import { createPrismaClient } from './prisma';
//@ts-expect-error
import { PrismaClientKnownRequestError } from '@prisma/client';

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
	SENTRY_DSN: string;
	DB: D1Database;
};
const app = new Hono<{ Bindings: Bindings }>();
app.use('*', sentry());
app.use('*', cors());


//? List
app.get('/', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accId = c.req.param('accId');

	try {
		const jwks = await prisma.jwks.findMany({
			where: {
				accId: accId,
			},
		});
		const result = await Promise.all(
			jwks.map(async (jwk) => {
				if (jwk.appID) {
					const appInfo = await prisma.application.findUnique({ where: { id: jwk.appID } });
					return {
						...jwk,
						appName: appInfo?.name,
					};
				} else {
					return {
						...jwk,
						appName: null,
					};
				}
			})
		);

		if (result.length === 0) {
			return c.json({ success: true, message: 'No jwks found', data: [] }, 404);
		}

		return c.json({ success: true, message: '', data: result });
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
//?Delete
app.delete('/', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accId = c.req.param('accId');

	try {
		const jwkID = c.req.query('id');
		if (!jwkID) return c.json({ success: true, message: 'JWK not present', data: [] });

		const jwk = await prisma.jwks.findUnique({
			where: { id: jwkID, accId: accId },
		});

		if (!jwk) {
			return c.json({ success: true, message: 'JWK not found', data: [] }, 404);
		}

		await prisma.application.delete({ where: { id: jwkID } });

		return c.json({ success: true, message: 'JWK deleted successfully,', data: '' });
	} catch (error) {
		console.error('Unexpected error:', error);
		return c.json({ success: false, message: 'Internal server error', data: [] }, 500);
	}
});
//? Create
app.post('/create', authMiddleware, async (c) => {
	const prisma = createPrismaClient(c.env.DB);
	const accId = c.req.param('accId');
	if (!accId || accId === 'null') return c.json({ success: true, message: 'No Account provided', data: [] }, 400);

	try {
		const requestJSONBody = await c.req.json();
		const result = RequestJWKCreateSchema.safeParse(requestJSONBody);
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

		if (result.data.type === 'jsonKey') {
			if (!result.data.jsonKey) {
				return c.json({ success: true, message: 'JSON Key must be present', data: [] });
			}
			const createPromises = result.data.jsonKey.keys.map(async (key: JWKsType) => {
				const { kid, ...jwk } = key;
				return prisma.jwks.create({
					data: {
						kid,
						jwk: JSON.stringify(jwk),
						lastChekcked: 0,
						status: 'enabled',
						account: {
							connect: {
								id: accId,
							},
						},
					},
				});
			});
			await Promise.all(createPromises);
			return c.json({ success: true, message: 'JWKs added successfully', data: [] }, 200);
		}
		if (result.data.type === 'jwkEndpoint') {
			if (!result.data.jwtEndpoint) {
				return c.json({ success: true, message: 'Endpoint must be present', data: [] });
			}
			const response = await fetch(result.data.jwtEndpoint);
			if (!response.ok!) return c.json({ success: true, message: 'Endpoint response not 200 OK', data: [] }, 422);
			const jwks: any = await response.json();
			const createPromises = jwks.keys.map(async (key: JWKsType) => {
				const { kid, ...jwk } = key;
				return prisma.jwks.create({
					data: {
						kid,
						jwk: JSON.stringify(jwk),
						lastChekcked: Date.now(),
						status: 'enabled',
						jwtEndpoint: result.data.jwtEndpoint,
						account: {
							connect: {
								id: accId,
							},
						},
					},
				});
			});
			await Promise.all(createPromises);
			return c.json({ success: true, message: 'JWKs added successfully', data: [] }, 200);
		}

		return c.json({ success: true, message: 'Data not valid', data: [] }, 201);
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
