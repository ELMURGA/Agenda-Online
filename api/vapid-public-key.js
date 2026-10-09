// Expone la clave pública VAPID para que el navegador pueda suscribirse a Web Push
// (navigator.serviceWorker.ready.then(r => r.pushManager.subscribe({applicationServerKey:...}))).
// La clave pública no es sensible: solo la privada (VAPID_PRIVATE_KEY) debe mantenerse secreta.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(500).json({ error: 'vapid' });
  return res.status(200).json({ publicKey });
};
