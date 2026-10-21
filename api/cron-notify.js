// Recordatorios por Web Push. Dos modos:
// - Por defecto (cron diario de la noche, ver vercel.json y supabase/schema.sql): por cada
//   calendario con dispositivos suscritos, si tiene algo pendiente "mañana", envía un resumen.
// - ?mode=hour (cada 5 minutos desde pg_cron en Supabase): avisa HOUR_BEFORE_MIN minutos
//   antes de cada evento que tenga hora, calculando la hora en horario de España.
// Vercel y pg_cron envían la cabecera Authorization con CRON_SECRET para que podamos verificarla.
const webPush = require('web-push');
const { SUPABASE_URL, SERVICE_KEY, rpc } = require('./_lib/supabase');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const TZ = 'Europe/Madrid';
const HOUR_BEFORE_MIN = 60;

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Fecha y hora actuales en España como "minutos desde época" de un reloj local
// (sin zona), para compararlas con las fechas/horas locales de los eventos.
function madridNowMin() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 60000;
}
function localMin(d, h) {
  const [y, m, dd] = d.split('-').map(Number), [hh, mm] = h.split(':').map(Number);
  return Date.UTC(y, m - 1, dd, hh, mm) / 60000;
}

function itemsOf(data) {
  const S = (data && data.S) || {};
  return Object.keys(S)
    .filter(k => k[0] === 'e')
    .map(k => { try { return JSON.parse(S[k]); } catch (e) { return null; } })
    .filter(Boolean);
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

  const mode = req.query && req.query.mode === 'hour' ? 'hour' : 'night';
  const dry = req.query && req.query.dry === '1';
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

  let sent = 0, skipped = 0, pruned = 0, failed = 0, due = 0;
  async function sendAll(subs, payload) {
    for (const sub of subs) {
      try {
        await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        failed++;
        console.error('push failed', e && e.statusCode, String((e && e.body) || (e && e.message) || '').slice(0, 200));
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          try { await rpc('prune_push_subscription', { p_endpoint: sub.endpoint }); pruned++; } catch (e2) {}
        }
      }
    }
  }

  const now = madridNowMin();
  for (const [keyHash, { data, subs }] of byKey) {
    const items = itemsOf(data);

    if (mode === 'hour') {
      // Toca avisar si ya estamos dentro de la hora previa y el evento aún no ha empezado.
      // Así, si una ejecución se retrasa o se salta, la siguiente lo recupera.
      for (const i of items) {
        if (i.x || !i.h || !/^\d{2}:\d{2}$/.test(i.h) || !/^\d{4}-\d{2}-\d{2}$/.test(i.d)) continue;
        const left = localMin(i.d, i.h) - now;
        if (left <= 0 || left > HOUR_BEFORE_MIN) continue;
        due++;
        if (dry) continue;
        let isNew = false;
        try {
          isNew = await rpc('mark_event_sent', { p_key: keyHash, p_event: String(i.id), p_kind: 'hour', p_when: i.d + ' ' + i.h });
        } catch (e) { isNew = false; }
        if (!isNew) { skipped++; continue; }
        await sendAll(subs, JSON.stringify({
          title: `${i.t} a las ${i.h}`,
          body: left >= 55 ? 'Dentro de 1 hora' : `Dentro de ${left} min`,
          url: '/'
        }));
      }
      continue;
    }

    const tomorrow = items.filter(i => i.d === target && !i.x);
    if (!tomorrow.length) continue;
    due++;
    if (dry) continue;

    let isNew = false;
    try {
      isNew = await rpc('mark_push_sent', { p_key: keyHash, p_notif_date: target });
    } catch (e) { isNew = false; }
    if (!isNew) { skipped++; continue; }

    const titles = tomorrow.sort((a, b) => (a.h || '') < (b.h || '') ? -1 : 1).map(i => i.t + (i.h ? ` (${i.h})` : ''));
    const shown = titles.slice(0, 5);
    const body = shown.join(', ') + (titles.length > 5 ? `… (+${titles.length - 5})` : '');
    await sendAll(subs, JSON.stringify({
      title: tomorrow.length === 1 ? 'Mañana: ' + tomorrow[0].t : `Mañana tienes ${tomorrow.length} cosas`,
      body,
      url: '/'
    }));
  }

  const out = { ok: true, mode, dry, date: mode === 'night' ? target : undefined, devices: (targets || []).length, calendars: byKey.size, due, sent, skipped, pruned, failed };
  if (sent || failed) console.log('cron-notify', JSON.stringify(out));
  return res.status(200).json(out);
};
