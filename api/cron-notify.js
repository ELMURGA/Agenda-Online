// Cron diario (ver vercel.json): por cada calendario con dispositivos suscritos,
// comprueba qué eventos tiene para "mañana" y, si hay alguno pendiente, envía un
// recordatorio por Web Push a todos sus dispositivos.
// Vercel invoca esta ruta automáticamente y añade la cabecera Authorization con
// el valor de CRON_SECRET (si está configurado) para que podamos verificarla.
const webPush = require('web-push');
const { SUPABASE_URL, SERVICE_KEY, rpc } = require('./_lib/supabase');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'config' });
  }
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const target = tomorrowISO();
  let targets;
  try {
    targets = await rpc('list_push_targets', {});
  } catch (e) {
    return res.status(500).json({ error: 'db' });
  }

  // Agrupamos las suscripciones por calendario (key_hash): varios dispositivos
  // pueden compartir la misma clave y todos deben recibir el mismo aviso.
  const byKey = new Map();
  for (const row of targets || []) {
    if (!byKey.has(row.key_hash)) byKey.set(row.key_hash, { data: row.data, subs: [] });
    byKey.get(row.key_hash).subs.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
  }

  let sent = 0, skipped = 0, pruned = 0;
  for (const [keyHash, { data, subs }] of byKey) {
    const S = (data && data.S) || {};
    const items = Object.keys(S)
      .filter(k => k[0] === 'e')
      .map(k => { try { return JSON.parse(S[k]); } catch (e) { return null; } })
      .filter(Boolean);
    const due = items.filter(i => i.d === target && !i.x);
    if (!due.length) continue;

    let isNew = false;
    try {
      isNew = await rpc('mark_push_sent', { p_key: keyHash, p_notif_date: target });
    } catch (e) { isNew = false; }
    if (!isNew) { skipped++; continue; }

    const titles = due.map(i => i.t);
    const shown = titles.slice(0, 5);
    const body = shown.join(', ') + (titles.length > 5 ? `… (+${titles.length - 5})` : '');
    const payload = JSON.stringify({
      title: due.length === 1 ? 'Mañana: ' + shown[0] : `Mañana tienes ${due.length} cosas`,
      body,
      url: '/'
    });

    for (const sub of subs) {
      try {
        await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          try { await rpc('prune_push_subscription', { p_endpoint: sub.endpoint }); pruned++; } catch (e2) {}
        }
      }
    }
  }

  return res.status(200).json({ ok: true, date: target, sent, skipped, pruned });
};
