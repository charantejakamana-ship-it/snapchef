/**
 * Creates the SnapChef tables, indexes and RLS policies automatically.
 * Tries, in order:
 *   1) Supabase Management API   (needs SUPABASE_ACCESS_TOKEN = sbp_...)
 *   2) Direct Postgres           (needs SUPABASE_DB_URL = postgresql://...)
 * Run with:  npm run setup:db
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function projectRef() {
  const u = process.env.SUPABASE_URL || '';
  const m = u.match(/https?:\/\/([a-z0-9]+)\.supabase\./i);
  return m ? m[1] : null;
}

async function viaManagementApi() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();
  if (!token || !ref) return false;
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Management API: ${r.status} ${body}`);
  console.log('✅ Schema applied via Supabase Management API');
  return true;
}

async function viaPostgres() {
  const conn = process.env.SUPABASE_DB_URL;
  if (!conn) return false;
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('✅ Schema applied via direct Postgres connection');
  return true;
}

const run = async () => {
  try {
    if (await viaManagementApi()) return;
  } catch (e) { console.warn('Management API failed:', e.message); }
  try {
    if (await viaPostgres()) return;
  } catch (e) { console.warn('Postgres connection failed:', e.message); }
  console.error('❌ Could not apply schema. Provide SUPABASE_ACCESS_TOKEN (sbp_...) or SUPABASE_DB_URL in server/.env');
  process.exit(1);
};
run();
