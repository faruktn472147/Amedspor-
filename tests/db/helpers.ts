import { Pool, type PoolClient } from "pg";

export const DB_URL = process.env.TEST_DATABASE_URL;

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!DB_URL) throw new Error("TEST_DATABASE_URL tanımlı değil");
  pool ??= new Pool({ connectionString: DB_URL, max: 4 });
  return pool;
}

export async function closePool() {
  await pool?.end();
  pool = null;
}

type Actor =
  | { kind: "service" }
  | { kind: "anon" }
  | { kind: "user"; id: string; aal?: "aal1" | "aal2" };

/** Bir sorguyu Supabase/PostgREST'in yaptığı gibi belirli bir rol ve JWT ile çalıştırır. */
export async function as<T = Record<string, unknown>>(
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("begin");
    if (actor.kind === "service") {
      await client.query("set local role service_role");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    } else if (actor.kind === "anon") {
      await client.query("set local role anon");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    } else {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.id, role: "authenticated", aal: actor.aal ?? "aal1" }),
      ]);
    }
    const res = await client.query(sql, params);
    await client.query("commit");
    return res.rows as T[];
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function superuser<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

let counter = 0;
export async function createUser(username?: string): Promise<string> {
  counter += 1;
  const name = username ?? `test_${Date.now().toString(36)}_${counter}`;
  const rows = await superuser<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [`${name}@example.test`, JSON.stringify({ username: name, accepted_terms: "true" })],
  );
  return rows[0].id;
}
