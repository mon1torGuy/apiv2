import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';

type Bindings = {
	DB: D1Database;
};

export const createPrismaClient = (env: Bindings['DB']) => {
	const adapter = new PrismaD1(env);
	const prisma = new PrismaClient({ adapter });
	return prisma;
};
