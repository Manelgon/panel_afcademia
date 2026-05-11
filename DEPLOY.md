# Despliegue del panel AFCademIA para un cliente nuevo

Esta guía explica cómo poner en marcha el panel desde cero para un cliente nuevo (proyecto Supabase nuevo + frontend desplegado).

## 1. Lo que necesitas instalar localmente (una sola vez)

- [Node.js 20+](https://nodejs.org)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started): `npm i -g supabase`
- Cuenta en Supabase con permisos para crear proyectos.
- Acceso a la consola de Supabase del **proyecto origen** (el que ya tienes funcionando).

## 2. Sacar el schema del proyecto origen

El proyecto actual lleva ~40 migraciones aplicadas. Para garantizar un script de instalación correcto, **dump del schema** desde la BD viva.

```bash
# Login en la CLI
supabase login

# Sacar el schema completo del proyecto origen (sin datos)
supabase db dump --project-ref <PROJECT_REF_ORIGEN> \
  --schema public --schema vault \
  --no-owner --no-privileges \
  -f deploy/schema.sql
```

Eso genera `deploy/schema.sql` con TODAS las tablas, RPCs, triggers, RLS, índices y publicaciones realtime tal como están en producción.

> Sustituye `<PROJECT_REF_ORIGEN>` por el ref del proyecto actual (lo encuentras en Settings → General de Supabase).

## 3. Crear el proyecto Supabase del cliente nuevo

1. Entra en https://app.supabase.com → **New project**.
2. Apunta:
   - `SUPABASE_URL` (Settings → API)
   - `anon key`
   - `service_role key`
   - `<PROJECT_REF>` (la cadena tipo `tfwnekfuqxpnezbjcbpj`)

## 4. Aplicar el schema

```bash
# Conectar la CLI al proyecto nuevo
supabase link --project-ref <PROJECT_REF_NUEVO>

# Aplicar el dump
psql "postgresql://postgres:<PASSWORD_DB>@db.<PROJECT_REF_NUEVO>.supabase.co:5432/postgres" \
  -f deploy/schema.sql
```

Alternativamente, **copia/pega** el contenido de `deploy/schema.sql` en el SQL Editor del nuevo proyecto y ejecútalo. Más simple.

## 5. Desplegar las edge functions

Las funciones viven en `supabase/functions/`. Hay 11:

| Función | Verify JWT | Propósito |
|---|---|---|
| `send-fundae-otp` | ❌ | OTP para formulario público FUNDAE |
| `send-fundae-form-link` | ❌ | Email del enlace al formulario FUNDAE |
| `send-fundae-alumnos-link` | ❌ | Email del enlace a fichas de alumnos |
| `evolcampus-proxy` | ✅ | Proxy genérico evolCampus |
| `evolcampus-sync-alumnos` | ✅ | Sincroniza matrículas/alumnos |
| `evolcampus-find-user` | ✅ | Busca alumno en evolCampus por DNI |
| `evolcampus-list-courses` | ✅ | Catálogo de cursos/grupos |
| `evolcampus-get-course-groups` | ✅ | Detalle de grupos de un curso |
| `evolcampus-create-enrollment` | ✅ | Matricular alumno |
| `evolcampus-create-group` | ✅ | Crear grupo en un curso |
| `evolcampus-test-connection` | ✅ | Probar credenciales evolCampus |

```bash
# Despliega todas de una vez al proyecto nuevo
supabase functions deploy --project-ref <PROJECT_REF_NUEVO>
```

> O una a una: `supabase functions deploy <slug> --project-ref <PROJECT_REF_NUEVO> --no-verify-jwt` para las marcadas con ❌.

## 6. Crear los buckets de Storage

En el panel de Supabase del nuevo proyecto → **Storage** → New bucket:

| Bucket | Público | Para qué |
|---|---|---|
| `doc-assets` | sí | Logo / firma / cabecera del emisor |
| `fundae-docs` | no | PDFs del expediente FUNDAE (pendiente y firmado) |
| `facturas` | no | PDFs de facturas |

Las políticas RLS de los buckets ya vienen aplicadas por el dump del schema (paso 4).

## 7. Configurar secrets

### 7.1 Vault (BD)

- **evolCampus**: el admin lo configura desde el propio panel en `/ajustes-emisor` (sección Integración evolCampus). No hace falta tocar Vault.

Alternativa por SQL:
```sql
SELECT vault.create_secret('<CLIENT_ID>', 'evolcampus_clientid');
SELECT vault.create_secret('<KEY>', 'evolcampus_key');
```

### 7.2 Variables de entorno de las edge functions

Las edge functions de email necesitan variables. En el panel de Supabase del nuevo proyecto → **Edge Functions → Secrets**:

| Variable | Para qué |
|---|---|
| `RESEND_API_KEY` | API key de [Resend](https://resend.com) — necesaria para `send-fundae-otp`, `send-fundae-form-link`, `send-fundae-alumnos-link`. |
| `SEND_FUNDAE_OTP_SECRET` | Secreto compartido para que la BD pueda invocar `send-fundae-otp` desde la RPC pública. Cualquier cadena aleatoria larga. |
| `SEND_FUNDAE_FORM_LINK_SECRET` | Igual pero para `send-fundae-form-link`. |
| `SEND_FUNDAE_ALUMNOS_SECRET` | Igual pero para `send-fundae-alumnos-link`. |

Estos secrets se referencian desde las RPCs de BD, así que los mismos valores hay que ponerlos también en variables de la BD (ver 7.3).

### 7.3 Variables de configuración de la BD (`pg_settings` runtime)

Algunas RPCs leen secretos vía `current_setting()`. Hay que setearlos como **app config** en el SQL Editor del proyecto nuevo:

```sql
ALTER DATABASE postgres SET "app.send_fundae_otp_secret" = '<MISMO_VALOR_QUE_EN_EDGE_SECRETS>';
ALTER DATABASE postgres SET "app.send_fundae_form_link_secret" = '<MISMO_VALOR_QUE_EN_EDGE_SECRETS>';
ALTER DATABASE postgres SET "app.send_fundae_alumnos_secret" = '<MISMO_VALOR_QUE_EN_EDGE_SECRETS>';
```

> Si las RPCs del schema actual usan otro mecanismo (ver el código de `solicitar_codigo_alumnos` y `send_fundae_alumnos_link`), adaptar.

## 8. Configurar n8n y los webhooks

El panel y la BD disparan webhooks a **n8n** para automatizar emails y notificaciones. Hay que:

### 8.1 Levantar tu propio n8n para el cliente

Opciones:
- **n8n Cloud** (https://n8n.io/cloud) — más fácil, suscripción mensual.
- **n8n self-hosted** en VPS, Railway, Fly.io...

Apunta la URL pública del n8n del cliente, ej: `https://n8n.midominio-cliente.com/`.

### 8.2 Importar los workflows de n8n

En `n8n/n8n_pdf_email_workflow.md` está documentado el workflow del email del PDF FUNDAE. Crea ese workflow (y los demás que necesites) en el n8n del cliente. Los webhooks que necesitas:

| Webhook URL (n8n) | Quién lo llama | Para qué |
|---|---|---|
| `<N8N_BASE>/webhook/fundae-pdf-email` | Frontend (`FundaePublicForm.jsx`) | Enviar PDF generado al cliente tras rellenar el formulario público. |
| `<N8N_BASE>/webhook/email-contacto-leads` | Frontend (`Leads.jsx`) | Enviar correos manuales al lead desde el panel. |
| `<N8N_BASE>/webhook/fundae-eventos` | BD (trigger `notify_n8n_fundae`) | Recibe cambios de estado del expediente FUNDAE (envío del formulario, factura pagada, etc.). |

### 8.3 Configurar las URLs del webhook

**Frontend** (en el `.env` del paso 9):
```
VITE_WEBHOOK_PDF_EMAIL=https://n8n.cliente.com/webhook/fundae-pdf-email
VITE_WEBHOOK_EMAIL_CONTACTO=https://n8n.cliente.com/webhook/email-contacto-leads
```

**BD** — el trigger `notify_n8n_fundae` tiene la URL **hardcoded** en su código. Hay que reescribir la función con la URL del cliente nuevo:

```sql
-- Cambiar la línea v_url := '...' al principio de la función
CREATE OR REPLACE FUNCTION public.notify_n8n_fundae() ...
DECLARE
    v_url constant text := 'https://n8n.cliente.com/webhook/fundae-eventos';
    ...
```

> Para hacerlo más mantenible, considera mover esta URL a `app.n8n_webhook_fundae` con `current_setting()`. Es 1 cambio pequeño que puedes hacer una vez.

### 8.4 Habilitar `pg_net` (extensión que dispara HTTP desde la BD)

```sql
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

> Normalmente Supabase la trae habilitada por defecto, pero verifícalo en Database → Extensions.

## 9. URLs hardcoded en el código de BD que hay que actualizar

Estas funciones SQL tienen URLs literales que apuntan a `panel.afcademia.com` y al webhook actual. Hay que reescribirlas con los valores del cliente nuevo:

| Función SQL | Qué cambiar |
|---|---|
| `send_fundae_form` | `v_base := 'https://panel.afcademia.com/fundae-form/'` → URL pública del cliente |
| `notify_n8n_fundae` | `v_url` (webhook n8n) y `v_public_base` (URL pública del cliente) |
| `issue_fundae_alumnos_token` (si existe) | Similar |

Búscalas y edítalas en el SQL Editor del nuevo proyecto.

## 10. Crear el usuario admin del cliente

```sql
-- En el SQL Editor del nuevo proyecto, después de que el cliente
-- haya creado su usuario via Authentication → Users → Add User:

UPDATE public.profiles
SET role = 'admin', nombre = 'Admin'
WHERE email = 'EMAIL_DEL_CLIENTE@ejemplo.com';
```

## 11. Configurar el frontend

Crea un nuevo `.env` con las credenciales del proyecto nuevo:

```
VITE_SUPABASE_URL=https://<PROJECT_REF_NUEVO>.supabase.co
VITE_SUPABASE_ANON_KEY=<ANON_KEY>
```

```bash
npm install
npm run build
```

Despliega el build (`dist/`) en el hosting que uses (Vercel, Netlify, Cloudflare Pages...). Configura las mismas variables de entorno (incluidas las `VITE_WEBHOOK_*` del paso 8.3) en el hosting.

## 12. Smoke test

1. Login con el admin → debería entrar al dashboard.
2. Crear un lead manual → aparece en `/leads`.
3. Convertir lead a cliente → aparece en `/clientes` con su `EXP-AAAA-001` correlativo.
4. `/ajustes-emisor` → meter credenciales evolCampus + "Probar conexión" → badge verde "Conectado".
5. `/cursos` → debería listar los cursos del nuevo cliente desde su evolCampus.
6. **Test de webhooks**: crear un expediente FUNDAE → "Enviar formulario" → comprobar:
   - El cliente recibe el email con el enlace (`Resend` envía vía edge function `send-fundae-form-link`).
   - n8n recibe la notificación de cambio de estado (workflow `fundae-eventos`).
7. **Test del formulario público FUNDAE**: rellenar el formulario → debería actualizar `clientes` con los datos fiscales y subir el PDF a `fundae-docs`.
8. **Test de OTP**: solicitar código OTP → llega un email a la dirección del cliente.

## Lo que arranca vacío en el cliente nuevo

- `leads`, `clientes`, `alumnos`, `matriculas`, `fundae_seguimiento`, `fundae_alumnos`, `lead_billing`, `fundae_form_tokens`, `flujos_embudo`, `segmentacion_despacho`, `company_settings`.
- Vault sin credenciales evolCampus (badge "Sin configurar").
- `profiles` solo tiene los usuarios que vayas creando manualmente.

## Lo que NO se duplica entre clientes

Cada cliente tiene **su propio proyecto Supabase**, así que:
- Sus alumnos no se mezclan con los de otros clientes.
- Sus credenciales evolCampus son suyas.
- Su storage es independiente.

Si en el futuro quieres pasar a multi-tenant (todos los clientes en el mismo proyecto), hay que añadir `tenant_id` a todas las tablas y reescribir el RLS. Es trabajo significativo y rompe el modelo actual.

## Mantenimiento de schema entre clientes

Cuando hagas cambios al panel:
1. Aplica migraciones en el proyecto **maestro** (el tuyo de desarrollo).
2. Vuelve a ejecutar `supabase db dump` para generar `deploy/schema.sql` actualizado.
3. Para cada cliente, ejecuta solo las **nuevas migraciones** (no el dump completo, eso destruiría datos). Lo más limpio es mantener un repositorio compartido de `supabase/migrations/` y aplicar con `supabase db push` por proyecto.
