# 📲 Instalar Bolsillo en tu iPhone — gratis, sin tarjeta

Esta guía publica la app en internet con **tres servicios gratuitos**.
Ninguno pide tarjeta de crédito. Tarda ~20 minutos la primera vez.

| Servicio | Para qué | Costo |
|---|---|---|
| **GitHub** | Guarda el código de la app | $0 |
| **Turso** | Base de datos en la nube (tus datos) | $0 (9 GB, de sobra) |
| **Vercel** | Ejecuta la app y te da la URL | $0 (uso personal) |

> ⚠️ **Importante:** tus datos actuales del entorno de desarrollo **no se
> transfieren**. Al publicar, la app arranca con los datos de ejemplo y
> puedes borrarlos desde *Ajustes → Datos* para empezar de cero.

---

## Paso 0 · Descarga el código

1. Abre la app y entra a **Ajustes → “Instalar en tu teléfono”**.
2. Toca **“Descargar código (bolsillo-source.zip)”**.
   (También puedes abrir la URL de la app y añadir `/bolsillo-source.zip`.)
3. Descomprime el ZIP en tu computadora. Verás una carpeta con
   `package.json`, `prisma/`, `src/`, `public/`, este `DEPLOY.md`, etc.

## Paso 1 · Sube el código a GitHub

1. Crea una cuenta en **github.com** (gratis).
2. Toca **New repository** → nombre: `bolsillo` → **Private** → **Create**.
3. En la página vacía del repo, elige **“uploading an existing file”**.
4. Arrastra **el contenido** de la carpeta descomprimida (no la carpeta en sí):

   - **1ª tanda:** la carpeta `src` (la más grande)
   - **2ª tanda:** las carpetas `public`, `prisma` y `db`, más los archivos
     sueltos de la raíz (`package.json`, `DEPLOY.md`, etc.)

   Puedes arrastrar ambas tandas en la misma página antes de confirmar.
   En Mac, muestra los archivos ocultos con **Cmd+Shift+.**
   para no perderte `.gitignore` y `.env.example`.
5. Escribe un mensaje (“versión inicial”) y toca **Commit changes**.

## Paso 2 · Crea la base de datos (Turso)

1. Entra a **platform.turso.io** y regístrate **con tu cuenta de GitHub**.
2. Toca **Create database**:
   - Name: `bolsillo`
   - Location: la más cercana (`mia` Miami es buena opción desde Venezuela).
3. Ya creada, entra a la base → **Settings/URL**: copia la **URL**
   (algo como `libsql://bolsillo-xxxx.turso.io`).
4. Entra a **Tokens** (o “Generate token”) → crea uno → copia el token
   (empieza con `eyJ…`). Guárdalo en un lugar seguro: no se vuelve a mostrar.

Tendrás dos valores: **URL** y **Token**. Los necesitarás en el paso 3.

## Paso 3 · Publica en Vercel

1. Entra a **vercel.com** y regístrate **con GitHub** (Continue with GitHub).
2. **Add New… → Project** → elige tu repo `bolsillo` → **Import**.
   (Deja todo como viene: detecta Next.js solo.)
3. Antes de desplegar, abre **Environment Variables** y agrega estas 4:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | la URL de Turso (`libsql://…`) |
   | `TURSO_AUTH_TOKEN` | el token de Turso (`eyJ…`) |
   | `DATABASE_URL` | la misma URL de Turso (`libsql://…`) |
   | `APP_PIN` | **elige tu PIN** (ej. `4321`) — candado de acceso 🔒 |

   > El PIN es importante: la URL es pública y ahí viven tus finanzas.
   > Al abrir la app pedirá el PIN una sola vez (queda recordado 90 días
   > en tu teléfono). Si omites la variable, la app queda sin candado.

4. Toca **Deploy** y espera ~2 minutos. 🎉
5. Te dará una URL tipo `https://bolsillo-xxxx.vercel.app`:
   **esa es tu app**. Ábrela en el iPhone.

## Paso 4 · Instálala en el iPhone

1. Abre la URL en **Safari**.
2. La primera carga crea las tablas y los datos de ejemplo automáticamente
   (puede tardar unos segundos extra; las siguientes son rápidas).
3. *Ajustes → Datos* → **Borrar datos de ejemplo** y registra los tuyos.
4. Safari → botón **Compartir** (cuadrado con flecha) → **“Agregar a
   pantalla de inicio”**. Queda como app con ícono propio, a pantalla completa.

---

## 🤖 IA opcional (gratis con Groq — incluye la VOZ)

El asistente, el escáner de comprobantes, el resumen semanal y la
**entrada por voz** usan IA. En el despliegue puedes activarlos **gratis**
con [Groq](https://groq.com) (registro rápido, sin tarjeta):

1. Crea una cuenta en **console.groq.com** → **API Keys** → **Create API
   Key** → copia la clave (`gsk_…`).
2. En Vercel: **Settings → Environment Variables** de tu proyecto, agrega:

   | Name | Value |
   |---|---|
   | `AI_BASE_URL` | `https://api.groq.com/openai/v1` |
   | `AI_API_KEY` | tu clave `gsk_…` |
   | `AI_MODEL` | `llama-3.3-70b-versatile` |
   | `AI_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` |
   | `AI_ASR_MODEL` | `whisper-large-v3` |

3. **Deployments → … → Redeploy** para que aplique.

Los nombres de modelos cambian con el tiempo: si alguno falla, revisa la
lista en console.groq.com/settings/models y ajusta la variable.
Alternativa solo texto/OCR: OpenRouter (`https://openrouter.ai/api/v1`,
modelos con sufijo `:free`; sin voz). Sin estas variables la app funciona
normal; solo la IA muestra un aviso de que no está activa.

## 🔄 Actualizar la app más adelante

Cuando te dé una versión nueva del código (ZIP actualizado):

1. Súbelo a GitHub (**Add file → Upload files** en tu repo; si un archivo
   ya existe, GitHub lo reemplaza al subir el mismo nombre).
2. Vercel vuelve a desplegar automáticamente (~1 min).

## 📊 Límites de los planes gratis (uso personal)

- **Vercel Hobby:** ancho de banda generoso; tras horas sin uso la app
  “duerme” y la primera carga tarda ~1–2 s extra.
- **Turso free:** 9 GB de almacenamiento y lecturas de sobra para una
  persona; la base nunca se pausa.
- **Sin tarjeta:** ninguno de los tres la pide para el plan gratuito.

## ❓ Preguntas frecuentes

- **“Error” en la primera carga** → revisa que las variables en Vercel
  coincidan exactamente con la URL y token de Turso (sin espacios), y haz
  Redeploy.
- **El build falla en Vercel** → lo más raro que puede pasar es un
  problema de instalación con Bun. Borra el archivo `bun.lock` del repo
  (GitHub → clic en él → papelera → commit) y haz Redeploy: instalará
  con npm.
- **¿Mis datos actuales se pasan?** No. Empiezas con los datos de ejemplo;
  bórralos y registra lo tuyo. La app de este entorno de desarrollo sigue
  disponible tal cual.
- **¿Es segura mi URL?** Lleva candado con **APP_PIN** (defínelo al
  publicar) y el repo puede ser privado. El PIN se pide una vez por
  dispositivo y queda recordado 90 días.
- **¿Funciona sin internet?** Como cualquier app de finanzas en la nube,
  necesita conexión; sin ella verás un aviso amarillo y se sincroniza al
  reconectar.
