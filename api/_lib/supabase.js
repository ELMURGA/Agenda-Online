// Helper compartido para invocar las funciones RPC de Supabase (ver supabase/schema.sql).
// Usado por los endpoints de notificaciones push (push-subscribe.js y cron-notify.js).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(args || {})
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.message) || 'rpc');
  return j;
}

module.exports = { SUPABASE_URL, SERVICE_KEY, rpc };
