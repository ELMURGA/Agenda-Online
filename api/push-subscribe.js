// Guarda o elimina la suscripción Web Push de este dispositivo, asociada a la
// clave del calendario (misma x-key que /api/sync). Ver supabase/schema.sql.
const { SUPABASE_URL, SERVICE_KEY, rpc } = require('./_lib/supabase');
const webPush = require('web-push');
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
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
      // Aviso de prueba inmediato: confirma al usuario que le llegan y, si el servicio
      // de push (Apple/Google) lo rechaza, devuelve su código para poder diagnosticarlo.
      let push = 'skipped';
      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        try {
          webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
          await webPush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify({
            title: 'Recordatorios activados',
            body: 'Te avisaremos la noche antes y 1 hora antes de los eventos con hora.',
            url: '/'
          }), { TTL: 3600, urgency: 'high' });
          push = 'sent';
        } catch (e) {
          push = 'error ' + ((e && e.statusCode) || '') + ' ' + String((e && e.body) || (e && e.message) || '').slice(0, 120);
          console.error('push test failed', push);
        }
      }
      return res.status(200).json({ ok: true, push });
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
