import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
    });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

// Lazy pool - only initializes when first accessed
export const pool = new Proxy({} as Pool, {
  get(target, prop, receiver) {
    const poolInstance = getPool();
    // Replace the proxy with the actual instance for subsequent accesses
    Object.setPrototypeOf(target, Object.getPrototypeOf(poolInstance));
    Object.assign(target, poolInstance);
    return Reflect.get(poolInstance, prop, receiver);
  },
});

// Lazy database instance - only initializes when first accessed
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop, receiver) {
    const poolInstance = getPool();
    const dbInstance = drizzle(poolInstance);
    // Replace the proxy with the actual instance for subsequent accesses
    Object.setPrototypeOf(target, Object.getPrototypeOf(dbInstance));
    Object.assign(target, dbInstance);
    return Reflect.get(dbInstance, prop, receiver);
  },
});
