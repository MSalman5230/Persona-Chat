import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

type Database = ReturnType<typeof drizzle<typeof schema>>;

let instance: Database | undefined;

function getDb(): Database {
	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	instance ??= drizzle(postgres(env.DATABASE_URL), { schema });
	return instance;
}

export const db = new Proxy({} as Database, {
	get(_target, property, receiver) {
		const database = getDb() as unknown as Record<PropertyKey, unknown>;
		const value = Reflect.get(database, property, receiver);
		return typeof value === 'function' ? value.bind(database) : value;
	}
});
