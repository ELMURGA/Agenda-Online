# 📅 Calendario 26/27 — Agenda Online & PWA

[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa)](https://web.dev/progressive-web-apps/)
[![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**Calendario 26/27** es una aplicación web progresiva (**PWA**) de gestión y planificación personal/académica diseñada específicamente para el curso **Septiembre 2026 – Agosto 2027**. 

Combina una experiencia visual cuidada al detalle (estética editorial, fondos fotográficos atmosféricos y microinteracciones) con una arquitectura **Local-First**, entrada de eventos mediante **procesamiento de lenguaje natural (NLP)** y **sincronización multi-dispositivo en tiempo real** respaldada por **Supabase** y **Vercel Serverless Functions**.

---

## 📑 Tabla de Contenidos

- [✨ Características Principales](#-características-principales)
- [🏗️ Arquitectura del Sistema](#️-arquitectura-del-sistema)
- [🔄 Cómo Funciona la Sincronización](#-cómo-funciona-la-sincronización)
- [🔔 Notificaciones Push (Recordatorios)](#-notificaciones-push-recordatorios)
- [🧠 Procesamiento de Lenguaje Natural (NLP)](#-procesamiento-de-lenguaje-natural-nlp)
- [🌦️ Integración Meteorológica](#️-integración-meteorológica)
- [📱 Instalación como App (PWA)](#-instalación-como-app-pwa)
- [📁 Estructura del Proyecto](#-estructura-del-proyecto)
- [🚀 Despliegue y Configuración](#-despliegue-y-configuración)
  - [1. Configuración de Base de Datos (Supabase)](#1-configuración-de-base-de-datos-supabase)
  - [2. Despliegue en Vercel](#2-despliegue-en-vercel)
  - [3. Variables de Entorno](#3-variables-de-entorno)
- [🔐 Seguridad y Privacidad](#-seguridad-y-privacidad)
- [🛠️ Stack Tecnológico](#️-stack-tecnológico)

---

## ✨ Características Principales

- **🎨 Diseño Editorial & UI Inmersiva**:
  - Tipografías prémium de Google Fonts (*Abril Fatface*, *Belleza*, *Allura* y *Montserrat*).
  - Fondos temáticos por mes con transiciones suaves en scroll (*parallax / opacity blending*).
  - Barra lateral (*rail*) con navegación rápida entre meses y selector dinámico de color.
  - Saludo interactivo según la hora del día con efecto de mecanografía (*typewriter*).
  - Anillo de progreso circular SVG que calcula el % de tareas completadas para la jornada actual.
  - Efecto de celebración con confeti en Canvas al marcar tareas como completadas.

- **⚡ Entrada Inteligente de Eventos (NLP)**:
  - Crea tareas escribiendo frases naturales como:
    > *"examen mates 15 oct 10h"* o *"entrega práctica viernes 18h"*
  - Extracción automática de fecha, hora, categoría y título con previsualización en tiempo real.

- **🏷️ Categorización Visual de Tareas**:
  - **Examen** (`#d8736a` / Terracota)
  - **Entrega** (`#b59a82` / Arena)
  - **Cumple** (`#e08aa5` / Rosa pastel)
  - **Tarea** (`#7d9168` / Verde salvia)
  - **Otro** (`#7b93b8` / Azul acero)

- **🌤️ Widget del Clima en Tiempo Real**:
  - Conexión a la API de **Open-Meteo** (sin consumo de cuotas de API keys).
  - Geoposición automática con fallback inteligente.
  - Modal desplegable con temperatura actual, mínimas/máximas, humedad, viento, probabilidad de precipitación y pronóstico extendido semanal con barras visuales térmicas.

- **🔄 Sincronización Segura sin Registro Tradicional**:
  - No requiere registrar correos ni contraseñas complejas.
  - Acceso mediante una **clave secreta**. Todos los dispositivos que compartan esa clave verán el mismo calendario unificado.
  - Derivación criptográfica local vía **SHA-256** antes del envío a la API.

- **📴 Arquitectura Local-First & PWA**:
  - Almacenamiento local instantáneo en `localStorage`.
  - Service Worker con estrategia de caché offline para funcionamiento garantizado sin conexión.
  - Instalable en pantalla de inicio en iOS, Android, macOS y Windows.

- **🔔 Recordatorios con Notificaciones Push**:
  - Botón "Activar recordatorios" que suscribe el dispositivo mediante el estándar **Web Push (VAPID)**.
  - Compatible con Android (navegador o instalada) e iOS 16.4+ (requiere instalar la PWA en pantalla de inicio).
  - Un **Vercel Cron Job** diario avisa de los eventos pendientes del día siguiente, incluso con la app cerrada.

---

## 🏗️ Arquitectura del Sistema

```mermaid
graph TD
    User([Dispositivo / PWA]) -->|Lectura / Escritura Local| LS[(localStorage)]
    User -->|SHA-256 Clave| Hash[Hash Criptográfico 64-hex]
    
    subgraph Frontend [Cliente Navegador / PWA]
        LS
        Hash
        SW[Service Worker: Cache & Offline]
        NLP[Parser NLP en tiempo real]
        Weather[Open-Meteo API]
    end

    subgraph Cloud [Vercel Serverless]
        API["/api/sync.js (Node.js)"]
        PushAPI["/api/push-subscribe.js"]
        VapidAPI["/api/vapid-public-key.js"]
        Cron["/api/cron-notify.js (Vercel Cron, diario)"]
    end

    subgraph Database [Supabase / PostgreSQL]
        RLS[Row Level Security]
        RPC1[RPC: get_or_create_calendar]
        RPC2[RPC: merge_calendar]
        RPC3[RPC: save/delete/list push_subscriptions]
        Table[(Tabla: public.calendars)]
        PushTable[(Tabla: public.push_subscriptions)]
        LogTable[(Tabla: public.push_log)]
    end

    User -->|GET / PUT con x-key| API
    User -->|Permiso de notificaciones| SW
    SW -->|PushManager.subscribe| PushAPI
    SW -->|clave pública VAPID| VapidAPI
    API -->|Service Role Key| RLS
    PushAPI -->|Service Role Key| RLS
    Cron -->|Service Role Key| RLS
    Cron -->|Web Push / VAPID| SW
    RLS --> RPC1
    RLS --> RPC2
    RLS --> RPC3
    RPC1 --> Table
    RPC2 --> Table
    RPC3 --> PushTable
    Cron --> LogTable
```

---

## 🔄 Cómo Funciona la Sincronización

La aplicación utiliza un algoritmo determinista de **Resolución de Conflictos basada en Última Escritura (LWW - Last-Write-Wins)** a nivel de campo:

1. **Estructura de Datos**:
   - `S` (State): Mapa de clave-valor con los datos del evento en formato serializado.
   - `T` (Timestamps): Marcas de tiempo UNIX (`Date.now()`) que registran cuándo se creó o modificó cada entrada por última vez.
2. **Proceso de Fusión en la Base de Datos**:
   - Al emitir una petición `PUT` a `/api/sync`, la función RPC de PostgreSQL `merge_calendar` bloquea la fila del calendario (`FOR UPDATE`) para garantizar concurrencia atómica.
   - Se comparan las marcas de tiempo entrantes (`p_data->'T'`) contra las existentes (`v_existing->'T'`).
   - Solo los campos con una marca temporal estrictamente mayor (`rt > lt`) sobreescriben el estado actual. Si se elimina un evento, se borra de `S` y se conserva su timestamp más reciente para propagar la eliminación.
3. **Detección Automática y Segundo Plano**:
   - Monitoreo de foco y visibilidad (`visibilitychange`). Al regresar a la pestaña, se lanza automáticamente un `pull` de cambios.
   - Almacenamiento diferido con debounce de 900 ms para evitar saturar la base de datos mientras el usuario escribe o interactúa.

---

## 🔔 Notificaciones Push (Recordatorios)

La app puede avisar de los eventos del día siguiente aunque esté cerrada, usando el estándar **Web Push** (sin servicios propietarios de terceros):

1. **Activación en el dispositivo**:
   - El botón 🔔 ("Activar recordatorios") solicita permiso de notificaciones y registra una suscripción (`PushSubscription`) en el `Service Worker` del navegador.
   - En **iOS** es necesario tener la PWA **instalada en la pantalla de inicio** (requisito de Apple desde iOS 16.4); en **Android** funciona también desde el navegador.
2. **Guardado en Supabase**:
   - La suscripción (`endpoint` + claves `p256dh`/`auth`) se envía a `/api/push-subscribe` junto con la misma `x-key` que identifica tu calendario, y queda asociada a él en la tabla `public.push_subscriptions`.
3. **Envío programado (Vercel Cron)**:
   - `vercel.json` define un **Cron Job** que invoca `/api/cron-notify` una vez al día (por defecto a las 20:00 UTC).
   - La función agrupa las suscripciones por calendario, calcula los eventos pendientes de **mañana** y envía un recordatorio firmado con las claves **VAPID** a cada dispositivo suscrito mediante la librería [`web-push`](https://www.npmjs.com/package/web-push).
   - Se evita enviar el mismo aviso dos veces el mismo día (tabla `public.push_log`) y se eliminan automáticamente las suscripciones caducadas (HTTP 404/410).
4. **Recepción en segundo plano**:
   - El `Service Worker` (`sw.js`) escucha el evento `push`, muestra la notificación del sistema y, al pulsarla (`notificationclick`), abre o enfoca la app.

> [!NOTE]
> El cron job y el envío de notificaciones requieren configurar las variables de entorno `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (y opcionalmente `VAPID_SUBJECT` y `CRON_SECRET`) — ver la sección [Variables de Entorno](#3-variables-de-entorno).

---

## 🧠 Procesamiento de Lenguaje Natural (NLP)

El analizador sintáctico en el cliente detecta de forma instantánea patrones en el texto introducido en el modal:

| Entrada de Ejemplo | Título Extraído | Fecha Asignada | Hora | Categoría |
| :--- | :--- | :--- | :--- | :--- |
| `examen mates 15 oct 10h` | Mates | 15 de Octubre 2026 | 10:00 | **Examen** |
| `entrega proyecto final viernes 18:30` | Proyecto final | Próximo viernes | 18:30 | **Entrega** |
| `cumple de Carlos pasado mañana` | De Carlos | Hoy + 2 días | — | **Cumple** |
| `comprar cuadernos hoy a las 17h` | Comprar cuadernos | Día de hoy | 17:00 | **Tarea** |

---

## 🌦️ Integración Meteorológica

El widget de la cabecera consulta directamente los datos de **Open-Meteo**:
- **Geolocalización**: Emplea la API estándar `navigator.geolocation` del navegador para obtener coordenadas locales exactas.
- **Respaldo Inteligente**: En caso de denegar permisos o carecer de soporte GPS, utiliza una ubicación predeterminada (Sevilla).
- **Caché Local**: Guarda las respuestas en `localStorage` con expiración para minimizar llamadas de red y optimizar la batería del dispositivo.

---

## 📱 Instalación como App (PWA)

Al cumplir con los estándares de Progressive Web App, **Calendario 26/27** puede instalarse sin pasar por App Store ni Google Play:

- **En iOS (Safari)**:
  1. Pulsa el botón **Compartir** (icono de cuadrado con flecha hacia arriba).
  2. Selecciona **Añadir a la pantalla de inicio**.
  3. Pulsa **Añadir**.
- **En Android (Chrome / Edge / Firefox)**:
  1. Pulsa el menú de tres puntos en la esquina superior derecha.
  2. Selecciona **Instalar aplicación** o **Añadir a la pantalla principal**.
- **En Escritorio (Chrome / Edge)**:
  1. Haz clic en el icono de instalación situado en la barra de direcciones del navegador.

---

## 📁 Estructura del Proyecto

```text
AgendaOnline/
├── api/
│   ├── _lib/
│   │   └── supabase.js     # Helper compartido para invocar RPC de Supabase (service_role)
│   ├── sync.js              # Función Serverless en Vercel (manejo de RPC Supabase, limpieza y auth)
│   ├── vapid-public-key.js  # Expone la clave pública VAPID al cliente
│   ├── push-subscribe.js    # Guarda / elimina la suscripción Push de un dispositivo
│   └── cron-notify.js       # Cron diario: envía recordatorios de eventos de "mañana"
├── assets/
│   ├── sep.jpg ... ago.jpg # Fondos fotográficos de alta resolución por cada mes
│   ├── flor.png            # Recurso decorativo
│   ├── icon-192.png        # Icono PWA (192x192)
│   └── icon-512.png        # Icono PWA (512x512 maskable)
├── supabase/
│   └── schema.sql          # DDL completo de PostgreSQL, tablas, RLS y funciones RPC atómicas
├── index.html              # Frontend SPA completo (HTML5 semántico, CSS3 moderno, lógica JS)
├── manifest.webmanifest    # Manifiesto de la Progressive Web App
├── package.json            # Dependencia `web-push` para las funciones Serverless
├── vercel.json              # Configuración del Cron Job diario (/api/cron-notify)
├── sw.js                   # Service Worker: caché offline + recepción de notificaciones Push
└── README.md               # Documentación oficial del proyecto
```

---

## 🚀 Despliegue y Configuración

### 1. Configuración de Base de Datos (Supabase)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En el panel lateral, dirígete a **SQL Editor** -> **New query**.
3. Copia y pega el contenido del archivo [`supabase/schema.sql`](file:///Users/usuario/Documents/WEBS/AgendaOnline/supabase/schema.sql) y haz clic en **Run**.
4. Este script configurará:
   - La tabla `public.calendars`.
   - Las tablas `public.push_subscriptions` y `public.push_log` (recordatorios).
   - Bloqueo de seguridad estricto con **Row Level Security (RLS)** sin políticas públicas.
   - Las funciones PL/pgSQL `get_or_create_calendar`, `merge_calendar` y las de notificaciones push (`save_push_subscription`, `delete_push_subscription`, `list_push_targets`, `mark_push_sent`...), autorizadas únicamente para el rol `service_role`.
5. Ve a **Project Settings** -> **API** y toma nota de:
   - **Project URL** (`https://xxxxxxxx.supabase.co`)
   - Clave privada **`service_role`** (*Secret* — nunca compartir ni incluir en el frontend).

### 2. Despliegue en Vercel

1. Vincula tu repositorio de GitHub con [Vercel](https://vercel.com/new).
2. Vercel detectará automáticamente la estructura estática, la carpeta de funciones `/api`, el `package.json` (instalará la dependencia `web-push`) y el Cron Job definido en `vercel.json`.
3. Genera un par de claves **VAPID** (solo hace falta una vez por proyecto) ejecutando en tu terminal:
   ```bash
   npx web-push generate-vapid-keys
   ```
4. Antes de desplegar, añade las variables de entorno detalladas a continuación.

### 3. Variables de Entorno

En tu panel de Vercel (**Settings** -> **Environment Variables**), añade las siguientes claves:

| Variable | Descripción | Ámbito |
| :--- | :--- | :--- |
| `SUPABASE_URL` | URL de tu proyecto Supabase (`https://<project-ref>.supabase.co`) | Producción / Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta con rol `service_role` de Supabase | Producción / Preview |
| `VAPID_PUBLIC_KEY` | Clave pública generada con `web-push generate-vapid-keys` | Producción / Preview |
| `VAPID_PRIVATE_KEY` | Clave privada generada junto a la anterior (*Secret*) | Producción / Preview |
| `VAPID_SUBJECT` | *(Opcional)* Contacto del remitente, p. ej. `mailto:tucorreo@dominio.com` | Producción / Preview |
| `CRON_SECRET` | *(Recomendado)* Cadena aleatoria; Vercel la envía automáticamente al invocar el cron para verificar que la petición es legítima | Producción |

> [!CAUTION]
> **Nunca** expongas `SUPABASE_SERVICE_ROLE_KEY` ni `VAPID_PRIVATE_KEY` en el cliente (`index.html`). Solo deben residir en las variables de entorno de Vercel, consumidas exclusivamente por las Serverless Functions (`/api/sync.js`, `/api/push-subscribe.js`, `/api/cron-notify.js`). `VAPID_PUBLIC_KEY` sí se expone al navegador (a través de `/api/vapid-public-key.js`) porque no es sensible.

---

## 🔐 Seguridad y Privacidad

- **Zero-Knowledge Hash en Frontend**: La clave introducida por el usuario nunca viaja en texto plano a la red; el cliente genera un digest SHA-256 (`cal2627|<clave>`), utilizándolo como identificador único (`x-key`).
- **Blindaje RLS**: Nadie puede consultar la base de datos de Supabase usando la clave anónima (`anon key`). Todas las mutaciones y consultas pasan obligatoriamente por el backend con validación de expresiones regulares de hash (`^[a-f0-9]{64}$`).
- **Protección contra DoS y Cargas Excesivas**: El endpoint valida el formato de clave, descarta campos maliciosos (`__proto__`), restringe el tamaño del payload a menos de 900 KB y aplica límites de caracteres en las notas.
- **Suscripciones Push aisladas por clave**: Cada suscripción Web Push queda ligada al `x-key` que la creó; solo esa misma clave puede eliminarla (`delete_push_subscription`), y el endpoint `/api/cron-notify` solo acepta peticiones con el `CRON_SECRET` correcto.

---

## 🛠️ Stack Tecnológico

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 Glassmorphism, Canvas API.
- **PWA**: Service Workers API, Web App Manifest, Push API / Notifications API.
- **Backend / Serverless**: Node.js en Vercel Serverless Functions, Vercel Cron Jobs.
- **Notificaciones**: Web Push (VAPID) vía la librería [`web-push`](https://www.npmjs.com/package/web-push).
- **Base de Datos**: PostgreSQL en Supabase, PL/pgSQL, JSONB.
- **APIs Externas**: Open-Meteo Weather Forecast API.
- **Tipografía y Gráficos**: Google Fonts, SVG nativo.

---

## 📄 Licencia

Este proyecto se distribuye bajo los términos de la licencia [MIT](LICENSE). Puedes adaptarlo y utilizarlo libremente.
