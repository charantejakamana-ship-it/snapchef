import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL;
// Prefer the new-style secret key if present, otherwise the service_role JWT.
const serviceKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[snapchef] SUPABASE_URL / service key missing in server/.env');
}

// service_role client: server-side only. Never expose this to the browser.
export const supabase = createClient(url || 'http://localhost', serviceKey || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws }, // Node 20 has no global WebSocket
});
