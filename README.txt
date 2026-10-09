CALENDARIO 26/27 — publicar en Vercel con sincronización (Supabase)

1) Crea un proyecto en supabase.com (gratis) si no tienes uno.
2) En el panel de Supabase: SQL Editor -> New query -> pega el contenido de
   supabase/schema.sql -> Run. Esto crea la tabla y las funciones necesarias.
3) En Supabase: Project Settings -> API -> copia "Project URL" y la clave
   "service_role" (NO la "anon public").
4) Sube esta carpeta a Vercel (vercel.com/new: arrastra la carpeta, o "vercel" en la terminal).
5) En el proyecto de Vercel: Settings -> Environment Variables -> añade:
   - SUPABASE_URL = (la Project URL de Supabase)
   - SUPABASE_SERVICE_ROLE_KEY = (la clave service_role; nunca la pongas en el navegador)
6) Deployments -> Redeploy.
7) Abre la web, escribe una clave y usa LA MISMA en cada dispositivo. La primera
   vez que uses una clave se crea un calendario nuevo para ella; si la vuelves
   a usar, recupera siempre el mismo calendario guardado en Supabase.
8) En el móvil: Compartir / menú del navegador -> "Añadir a pantalla de inicio" para instalarla como app.

9) (Opcional) Recordatorios por notificación push:
   - Genera tus claves VAPID en tu terminal: npx web-push generate-vapid-keys
   - En Vercel añade las variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
     VAPID_SUBJECT (p.ej. mailto:tucorreo@dominio.com) y CRON_SECRET (cadena
     aleatoria, Vercel la usa para proteger el cron job diario).
   - Redeploy. En la app, pulsa el botón 🔔 "Activar recordatorios" (en iOS,
     la app debe estar instalada en pantalla de inicio, iOS 16.4+).
   - Cada día (20:00 UTC) un Cron Job avisa de los eventos pendientes de mañana.
