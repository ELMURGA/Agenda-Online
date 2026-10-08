// Sincronización del calendario: guarda {S:valores, T:marcas de tiempo} en Supabase (Postgres)
// bajo una clave derivada de la clave secreta (ver supabase/schema.sql para el esquema y las
// funciones RPC que hacen la fusión de datos de forma atómica en la base de datos).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OK_KEY = /^[\w:.\-]{1,80}$/;

async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.message) || 'rpc');
  return j;
}

function clean(d) {
  const S = {}, T = {};
  if (!d || typeof d !== 'object') return { S, T };
  const ts = d.T && typeof d.T === 'object' ? d.T : {}, vs = d.S && typeof d.S === 'object' ? d.S : {};
  for (const k of Object.keys(ts)) {
    if (k === '__proto__' || !OK_KEY.test(k) || typeof ts[k] !== 'number') continue;
    T[k] = ts[k];
    const v = vs[k];
    if (typeof v === 'string' && v.length <= 4000) S[k] = v;
    else if (v === true) S[k] = true;
  }
  return { S, T };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'db' });
  const key = req.headers['x-key'];
  if (!/^[a-f0-9]{64}$/.test(key || '')) return res.status(401).json({ error: 'key' });
  try {
    if (req.method === 'GET') {
      const rows = await rpc('get_or_create_calendar', { p_key: key });
      const row = (Array.isArray(rows) && rows[0]) || { data: { S: {}, T: {} }, is_new: true };
      return res.status(200).json({ data: clean(row.data), isNew: !!row.is_new });
    }
    if (req.method === 'PUT') {
      let b = req.body;
      if (typeof b === 'string') b = JSON.parse(b);
      const incoming = clean(b);
      if (JSON.stringify(incoming).length > 900000) return res.status(413).json({ error: 'size' });
      const merged = await rpc('merge_calendar', { p_key: key, p_data: incoming });
      return res.status(200).json({ data: clean(merged) });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'fail' });
  }
};
