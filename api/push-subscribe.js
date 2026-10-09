// Guarda o elimina la suscripción Web Push de este dispositivo, asociada a la
// clave del calendario (misma x-key que /api/sync). Ver supabase/schema.sql.
const { SUPABASE_URL, SERVICE_KEY, rpc } = require('./_lib/supabase');
const OK_KEY = /^[a-f0-9]{64}$/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'db' });
  const key = req.headers['x-key'];
  if (!OK_KEY.test(key || '')) return res.status(401).json({ error: 'key' });

  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b || '{}'); } catch (e) { b = {}; }
  }
  const endpoint = b && b.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length < 10 || endpoint.length > 2000) {
    return res.status(400).json({ error: 'endpoint' });
  }

  try {
    if (req.method === 'POST') {
      const keys = (b && b.keys) || {};
      const { p256dh, auth } = keys;
      if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
        return res.status(400).json({ error: 'keys' });
      }
      await rpc('save_push_subscription', { p_key: key, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await rpc('delete_push_subscription', { p_key: key, p_endpoint: endpoint });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'fail' });
  }
};
