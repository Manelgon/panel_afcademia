-- ══════════════════════════════════════════════════════════════════════
-- SCHEMA FUNDAE: Seguimiento de formación FUNDAE
-- Tabla: fundae_seguimiento
-- ══════════════════════════════════════════════════════════════════════
--
-- FLUJO DE ESTADOS GENERAL (expediente):
--   pendiente       → Expediente creado, formulario sin enviar
--   en_curso        → Formulario enviado, proceso activo
--   completado      → Expediente finalizado con éxito
--   incidencia      → Hay un problema que requiere atención
--   cancelado       → Expediente cancelado
--
-- ESTADO DEL FORMULARIO PÚBLICO (estado_formulario):
--   pendiente            → Link enviado, cliente no ha rellenado aún
--   cumplimentado        → Cliente envió el formulario correctamente
--   firmado              → Documentación firmada y validada
--   archivado            → Expediente cerrado/archivado
--
-- FLUJO DE PASOS BOOLEANOS:
--   0. formulario_pendiente_enviar → El formulario está listo para enviarse
--   1. formulario_enviado          → Se envía el formulario al cliente
--   2. formulario_recibido         → El cliente lo recibe y cumplimenta
--   3. creditos_verificados        → Se verifica si tiene créditos FUNDAE
--   4. factura_enviada             → Se envía la factura al cliente
--   5. factura_pagada              → El cliente paga la factura
--   6. ficha_alumno_enviada        → Se envía la ficha de alumno
--
-- INSTRUCCIONES:
-- 1. Ir a Supabase > SQL Editor > New Query
-- 2. Pegar TODO este archivo y ejecutar
-- 3. Notificación n8n (pasos + estado): sección 1.B (pg_net); no duplicada en schema.sql del CRM.
-- 4. Token formulario: issue_fundae_form_token(uuid); send_fundae_form(uuid) INSERT + marca enviado + estado en_curso (panel).
-- 6. Form público FUNDAE: política fundae_select_public (anon SELECT en fundae_seguimiento) necesaria para el embed desde fundae_form_tokens.
-- ══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- 0. TIPOS ENUM
-- ═══════════════════════════════════════

DO $$ BEGIN
    CREATE TYPE estado_formulario_enum AS ENUM (
        'pendiente',
        'cumplimentado',
        'firmado',
        'archivado'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════
-- 1. TABLA: fundae_seguimiento
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fundae_seguimiento (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                 bigint      REFERENCES public.leads(id) ON DELETE SET NULL,

    -- ── Datos de empresa (Formulario Oficial) ────────────────────────
    empresa                 text,
    razon_social            text,
    cif                     text,
    email                   text,
    telefono                text,
    prefijo_telefono        text        DEFAULT '+34',

    -- Domicilio (desgranado)
    domicilio               text,           -- campo legacy / concatenado
    tipo_via                text,           -- Ej. Calle, Avda, Plaza...
    nombre_via              text,
    numero_via              text,
    piso                    text,
    puerta                  text,
    poblacion               text,
    codigo_postal           text,
    provincia               text,

    -- Datos laborales
    convenio_referencia     text,
    cnae                    text,
    ccc                     text,
    num_medio_empleados     text,

    -- Representante legal (desgranado)
    representante_empresa   text,           -- campo legacy
    representante_nombre    text,
    representante_apellido1 text,
    representante_apellido2 text,
    nif_nie_representante   text,

    -- ── Datos financieros ────────────────────────────────────────────
    creditos_fundae         numeric     DEFAULT 0,
    facturado               numeric     DEFAULT 0,
    pagado                  numeric     DEFAULT 0,
    num_asistentes          integer     DEFAULT 0,

    -- ── Estado general del expediente ────────────────────────────────
    estado                  text        DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'en_curso', 'completado', 'incidencia', 'cancelado')),

    -- ── Estado del formulario público ────────────────────────────────
    estado_formulario       estado_formulario_enum DEFAULT 'pendiente',

    -- ── Pasos booleanos del flujo ────────────────────────────────────
    formulario_pendiente_enviar boolean DEFAULT false,
    formulario_enviado          boolean DEFAULT false,
    formulario_cumplimentado    boolean DEFAULT false,
    formulario_recibido         boolean DEFAULT false,
    creditos_verificados        boolean DEFAULT false,
    factura_enviada             boolean DEFAULT false,
    factura_pagada              boolean DEFAULT false,
    ficha_alumno_enviada        boolean DEFAULT false,

    -- ── Notas / incidencias ──────────────────────────────────────────
    comentarios             text,

    -- ── Timestamps ───────────────────────────────────────────────────
    fecha_inicio            timestamptz DEFAULT now(),
    updated_at              timestamptz DEFAULT now()
);

-- ── MIGRACIONES / ACTUALIZACIONES ──────────────────────────────────
-- Idempotentes: se ejecutan aunque la tabla ya exista.

ALTER TABLE public.fundae_seguimiento ALTER COLUMN lead_id TYPE bigint;

ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS razon_social            text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS prefijo_telefono        text DEFAULT '+34';
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS domicilio               text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS tipo_via                text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS nombre_via              text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS numero_via              text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS piso                   text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS puerta                 text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS poblacion               text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS codigo_postal           text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS provincia               text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS convenio_referencia     text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS cnae                   text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS ccc                    text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS num_medio_empleados     text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS representante_empresa   text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS representante_nombre    text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS representante_apellido1 text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS representante_apellido2 text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS nif_nie_representante   text;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS formulario_pendiente_enviar boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS formulario_enviado      boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS formulario_cumplimentado boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS formulario_recibido     boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS creditos_verificados    boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS factura_enviada         boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS factura_pagada          boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS ficha_alumno_enviada    boolean DEFAULT false;

-- NUEVA: estado del formulario público
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS estado_formulario estado_formulario_enum DEFAULT 'pendiente';

-- ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE  public.fundae_seguimiento IS 'Seguimiento de expedientes FUNDAE. Flujo: formulario → créditos → factura → pago → ficha alumno';
COMMENT ON COLUMN public.fundae_seguimiento.lead_id IS 'Lead de origen (convertido con interes_fundae=true)';
COMMENT ON COLUMN public.fundae_seguimiento.estado_formulario IS 'Estado del formulario público: pendiente | cumplimentado | firmado | archivado';
COMMENT ON COLUMN public.fundae_seguimiento.formulario_pendiente_enviar IS '0. El formulario está pendiente de enviar';
COMMENT ON COLUMN public.fundae_seguimiento.formulario_enviado IS '1. Se envió el formulario al cliente';
COMMENT ON COLUMN public.fundae_seguimiento.formulario_cumplimentado IS '2. El cliente rellenó el formulario (pero no firmado)';
COMMENT ON COLUMN public.fundae_seguimiento.formulario_recibido IS '3. El cliente devolvió el formulario firmado';
COMMENT ON COLUMN public.fundae_seguimiento.creditos_verificados IS '4. Se verificó que el cliente tiene créditos FUNDAE';
COMMENT ON COLUMN public.fundae_seguimiento.factura_enviada IS '4. Se envió la factura al cliente';
COMMENT ON COLUMN public.fundae_seguimiento.factura_pagada IS '5. El cliente ha pagado la factura';
COMMENT ON COLUMN public.fundae_seguimiento.ficha_alumno_enviada IS '6. Se envió la ficha de alumno';


-- Trigger: auto-update de updated_at
DROP TRIGGER IF EXISTS set_updated_at_fundae ON public.fundae_seguimiento;
CREATE TRIGGER set_updated_at_fundae
    BEFORE UPDATE ON public.fundae_seguimiento
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_fundae_lead_id           ON public.fundae_seguimiento(lead_id);
CREATE INDEX IF NOT EXISTS idx_fundae_estado            ON public.fundae_seguimiento(estado);
CREATE INDEX IF NOT EXISTS idx_fundae_estado_formulario ON public.fundae_seguimiento(estado_formulario);


-- ═══════════════════════════════════════════════════════════════════
-- 1.B TRIGGER: NOTIFICAR A n8n (avanzar paso + cambio de estado)
-- ═══════════════════════════════════════════════════════════════════
-- Dispara un POST a n8n cada vez que:
--   - Un paso booleano pasa de false a true  → action = 'advance_step'
--     (prioridad sobre cambio de estado: mismo UPDATE puede pasar pendiente→en_curso + marcar pasos)
--   - Solo cambió 'estado' sin avance detectado → action = 'update_status'
-- Payload (compatible con el workflow antiguo de n8n):
-- {
--   "action":       "advance_step" | "update_status",
--   "step":         "formulario_enviado" | ... | null,
--   "old_estado":   "pendiente" | null,
--   "record_id":    "<uuid>",
--   "empresa":      "...",
--   "email":        "...",
--   "record":       { ... fila expediente NEW ... },
--   "token":        "<uuid>|null",
--   "public_url":   "https://panel.afcademia.com/fundae-form/<uuid>|null"
-- }
-- Si el paso es envío de formulario (pendiente_enviar | enviado), se adjunta el último token
-- de fundae_form_tokens para ese expediente (el que crea send_fundae_form antes del UPDATE).
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_n8n_fundae()
RETURNS TRIGGER AS $$
DECLARE
    v_url         text := 'https://serinwebhook.afcademia.com/webhook/37052baf-616d-44fd-b610-8eb4387d2c62';
    v_public_base constant text := 'https://panel.afcademia.com/fundae-form/';
    v_action      text := NULL;
    v_step        text := NULL;
    v_token       uuid := NULL;
    v_public_url  text := NULL;
    v_steps       text[] := ARRAY[
        'formulario_pendiente_enviar',
        'formulario_enviado',
        'formulario_cumplimentado',
        'formulario_recibido',
        'creditos_verificados',
        'factura_enviada',
        'factura_pagada',
        'ficha_alumno_enviada'
    ];
    s             text;
BEGIN
    -- 1) Avance de paso (si en el mismo UPDATE también cambió estado, seguimos siendo advance_step
    --    para que el payload lleve token + public_url cuando toque el envío del formulario).
    FOREACH s IN ARRAY v_steps LOOP
        IF COALESCE((to_jsonb(OLD) ->> s)::boolean, false) = false
           AND COALESCE((to_jsonb(NEW) ->> s)::boolean, false) = true THEN
            v_action := 'advance_step';
            v_step   := s;
            EXIT;
        END IF;
    END LOOP;

    IF v_action IS NULL AND OLD.estado IS DISTINCT FROM NEW.estado THEN
        v_action := 'update_status';
    END IF;

    IF v_action IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_action = 'advance_step'
       AND v_step IS NOT NULL
       AND v_step IN ('formulario_pendiente_enviar', 'formulario_enviado') THEN
        SELECT t.token INTO v_token
        FROM public.fundae_form_tokens t
        WHERE t.fundae_id = NEW.id
        ORDER BY t.created_at DESC NULLS LAST, t.id DESC
        LIMIT 1;
        IF v_token IS NOT NULL THEN
            v_public_url := v_public_base || v_token::text;
        END IF;
    END IF;

    PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
                       'action',      v_action,
                       'step',        v_step,
                       'old_estado',  OLD.estado,
                       'estado',      NEW.estado,
                       'record_id',   NEW.id,
                       'empresa',     NEW.empresa,
                       'email',       NEW.email,
                       'record',      to_jsonb(NEW),
                       'token',       v_token,
                       'public_url',  v_public_url
                   )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS fundae_notify_n8n ON public.fundae_seguimiento;
CREATE TRIGGER fundae_notify_n8n
    AFTER UPDATE ON public.fundae_seguimiento
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_n8n_fundae();


-- ═══════════════════════════════════════
-- 2. RLS (Row Level Security)
-- ═══════════════════════════════════════

ALTER TABLE public.fundae_seguimiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fundae_select" ON public.fundae_seguimiento;
CREATE POLICY "fundae_select" ON public.fundae_seguimiento
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "fundae_insert" ON public.fundae_seguimiento;
CREATE POLICY "fundae_insert" ON public.fundae_seguimiento
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "fundae_update" ON public.fundae_seguimiento;
CREATE POLICY "fundae_update" ON public.fundae_seguimiento
  FOR UPDATE TO authenticated
  USING (true);

-- Permite update anónimo (el cliente escribe desde el formulario público)
DROP POLICY IF EXISTS "fundae_update_public" ON public.fundae_seguimiento;
CREATE POLICY "fundae_update_public" ON public.fundae_seguimiento
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Lectura anónima del expediente (necesaria para embed fundae_seguimiento(*) desde fundae_form_tokens)
DROP POLICY IF EXISTS "fundae_select_public" ON public.fundae_seguimiento;
CREATE POLICY "fundae_select_public" ON public.fundae_seguimiento
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "fundae_delete" ON public.fundae_seguimiento;
CREATE POLICY "fundae_delete" ON public.fundae_seguimiento
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ═══════════════════════════════════════
-- 3. REALTIME
-- ═══════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.fundae_seguimiento;


-- ═══════════════════════════════════════
-- 4. TABLA: fundae_form_tokens
-- Tokens de verificación para formularios
-- FUNDAE públicos que rellenan los leads
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fundae_form_tokens (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fundae_id           UUID NOT NULL REFERENCES public.fundae_seguimiento(id) ON DELETE CASCADE,
    token               UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    verification_code   VARCHAR(6),          -- NULL hasta que el lead solicite código
    email               VARCHAR(255) NOT NULL,
    attempts            INT DEFAULT 0,
    max_attempts        INT DEFAULT 5,
    verified            BOOLEAN DEFAULT false,
    used                BOOLEAN DEFAULT false,
    expires_at          TIMESTAMPTZ DEFAULT (now() + interval '48 hours'),
    created_at          TIMESTAMPTZ DEFAULT now(),
    verified_at         TIMESTAMPTZ,
    code_sent_at        TIMESTAMPTZ          -- Cooldown 5 min para regenerar código
);

COMMENT ON TABLE  public.fundae_form_tokens IS 'Tokens de verificación para formularios FUNDAE públicos';
COMMENT ON COLUMN public.fundae_form_tokens.token IS 'UUID único que va en la URL del enlace público';
COMMENT ON COLUMN public.fundae_form_tokens.verification_code IS 'Código de 6 dígitos enviado por email';
COMMENT ON COLUMN public.fundae_form_tokens.attempts IS 'Número de intentos de verificación fallidos';
COMMENT ON COLUMN public.fundae_form_tokens.max_attempts IS 'Máximo de intentos permitidos (default 5)';
COMMENT ON COLUMN public.fundae_form_tokens.verified IS 'true cuando el código se verificó correctamente';
COMMENT ON COLUMN public.fundae_form_tokens.used IS 'true cuando el formulario fue completado y enviado';
COMMENT ON COLUMN public.fundae_form_tokens.expires_at IS 'El enlace expira 48h después de crearse';

-- Índices
CREATE INDEX IF NOT EXISTS idx_fundae_form_tokens_token     ON public.fundae_form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_fundae_form_tokens_fundae_id ON public.fundae_form_tokens(fundae_id);

-- ── FK: garantizar ON DELETE CASCADE (CREATE TABLE IF NOT EXISTS no corrige FKs viejos)
-- Al eliminar expediente → se borran todas las filas de fundae_form_tokens de ese fundae_id.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        INNER JOIN pg_class rel ON rel.oid = c.conrelid
        INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        INNER JOIN pg_class ref ON ref.oid = c.confrelid
        INNER JOIN pg_namespace refnsp ON refnsp.oid = ref.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'fundae_form_tokens'
          AND c.contype = 'f'
          AND refnsp.nspname = 'public'
          AND ref.relname = 'fundae_seguimiento'
    LOOP
        EXECUTE format('ALTER TABLE public.fundae_form_tokens DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.fundae_form_tokens
    ADD CONSTRAINT fundae_form_tokens_fundae_id_fkey
    FOREIGN KEY (fundae_id)
    REFERENCES public.fundae_seguimiento(id)
    ON DELETE CASCADE;

COMMENT ON COLUMN public.fundae_form_tokens.fundae_id IS 'Expediente; se eliminan estos tokens automáticamente al borrar el expediente (CASCADE).';

-- RLS
ALTER TABLE public.fundae_form_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fundae_tokens_select_by_token" ON public.fundae_form_tokens;
CREATE POLICY "fundae_tokens_select_by_token" ON public.fundae_form_tokens
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "fundae_tokens_update_by_token" ON public.fundae_form_tokens;
CREATE POLICY "fundae_tokens_update_by_token" ON public.fundae_form_tokens
    FOR UPDATE USING (true);

-- Insert: anónimo permitido (el frontend inserta al confirmar envío)
DROP POLICY IF EXISTS "fundae_tokens_insert_anon" ON public.fundae_form_tokens;
CREATE POLICY "fundae_tokens_insert_anon" ON public.fundae_form_tokens
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "fundae_tokens_delete_service" ON public.fundae_form_tokens;
CREATE POLICY "fundae_tokens_delete_service" ON public.fundae_form_tokens
    FOR DELETE USING (auth.role() = 'service_role');

-- DELETE en cascada: el borrado del expediente ejecuta DELETE en hijos como el mismo rol (admin).
-- Sin esta política, CASCADE fallaba aunque la FK fuera ON DELETE CASCADE.
DROP POLICY IF EXISTS "fundae_tokens_delete_admin" ON public.fundae_form_tokens;
CREATE POLICY "fundae_tokens_delete_admin" ON public.fundae_form_tokens
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- ───────────────────────────────────────────────────────────────────
-- 4.A.1 RPC: generar código OTP y guardarlo (UPDATE fundae_form_tokens)
-- ───────────────────────────────────────────────────────────────────
-- El formulario público puede llamar solicitar_fundae_codigo_publico(uuid) (anon) desde el clic
-- «Solicitar código»: actualiza verification_code y dispara pg_net al webhook n8n del email.
-- Alternativa n8n-only: POST .../rest/v1/rpc/request_fundae_verification_code con service_role.
--
-- Ejemplo desde n8n: POST .../rest/v1/rpc/request_fundae_verification_code
-- Body: {"p_token":"uuid-del-token-de-la-url"}
-- Respuesta JSON: success, code, email, empresa, public_url | error, seconds_left...
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_fundae_verification_code(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r                public.fundae_form_tokens%ROWTYPE;
    v_code           text;
    v_num            int;
    v_wait_seconds   int;
    v_emp            text;
    v_base constant  text := 'https://panel.afcademia.com/fundae-form/';
BEGIN
    IF p_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_token');
    END IF;

    SELECT * INTO r FROM public.fundae_form_tokens WHERE token = p_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
    END IF;

    IF r.used THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_used');
    END IF;

    IF r.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'expired');
    END IF;

    IF r.code_sent_at IS NOT NULL AND r.code_sent_at > now() - interval '5 minutes' THEN
        v_wait_seconds := CEIL(EXTRACT(EPOCH FROM (r.code_sent_at + interval '5 minutes' - now())))::int;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'cooldown',
            'seconds_left', GREATEST(v_wait_seconds, 0)
        );
    END IF;

    v_num := LEAST((trunc(random() * 1000000))::int, 999999);
    v_code := lpad(v_num::text, 6, '0');

    SELECT COALESCE(NULLIF(trim(f.empresa), ''), NULLIF(trim(f.razon_social), ''), '')
    INTO v_emp
    FROM public.fundae_seguimiento f
    WHERE f.id = r.fundae_id;

    UPDATE public.fundae_form_tokens
    SET verification_code = v_code,
        code_sent_at = now(),
        attempts = 0
    WHERE token = p_token;

    RETURN jsonb_build_object(
        'success',      true,
        'code',         v_code,
        'email',        r.email,
        'empresa',      CASE WHEN COALESCE(NULLIF(trim(v_emp), ''), '') = '' THEN 'Cliente' ELSE trim(v_emp) END,
        'token_text',   p_token::text,
        'public_url',   v_base || p_token::text
    );
END;
$$;

REVOKE ALL ON FUNCTION public.request_fundae_verification_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_fundae_verification_code(uuid) TO service_role;

COMMENT ON FUNCTION public.request_fundae_verification_code(uuid) IS
  'OTP 6 dígitos + UPDATE fundae_form_tokens. Solo service_role / n8n.';

-- Formulario público: anon llama esta RPC desde el clic en «Solicitar código».
-- Reutiliza request_fundae_verification_code (UPDATE en BD); no devuelve el código al cliente.
-- Opcionalmente notifica por pg_net el mismo webhook n8n que envía el email (solo servidor).
CREATE OR REPLACE FUNCTION public.solicitar_fundae_codigo_publico(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payload   jsonb;
    v_otp_hook  constant text := 'https://serinwebhook.afcademia.com/webhook/cdb06810-28dd-4898-a757-d39fd586fb49';
BEGIN
    v_payload := public.request_fundae_verification_code(p_token);

    IF COALESCE((v_payload ->> 'success')::boolean, false) IS DISTINCT FROM true THEN
        RETURN v_payload;
    END IF;

    PERFORM net.http_post(
        url     := v_otp_hook,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
            'otp_email',  true,
            'code',       v_payload ->> 'code',
            'email',      v_payload ->> 'email',
            'empresa',    v_payload ->> 'empresa',
            'public_url', v_payload ->> 'public_url',
            'token',      v_payload ->> 'token_text'
        )
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) TO authenticated;

COMMENT ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) IS
  'Clic «Solicitar código» en FUNDAE público: UPDATE + webhook n8n; respuesta sin código OTP.';

-- ───────────────────────────────────────────────────────────────────
-- 4.B RPC: token FUNDAE → INSERT en fundae_form_tokens + (opcional) marcar expediente
-- ───────────────────────────────────────────────────────────────────
-- • issue_fundae_form_token(uuid) — solo gen_random_uuid() + INSERT token (48h email).
-- • send_fundae_form(uuid) — token + formulario marcado enviado + estado en_curso (salvo completado/cancelado)
-- Panel: supabase.rpc('send_fundae_form', { p_fundae_id: '<uuid>' })
-- ───────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.send_fundae_form(uuid, text);

CREATE OR REPLACE FUNCTION public.issue_fundae_form_token(p_fundae_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    f        public.fundae_seguimiento%ROWTYPE;
    v_email  text;
    v_token  uuid := gen_random_uuid();
    v_base   constant text := 'https://panel.afcademia.com/fundae-form/';
BEGIN
    IF p_fundae_id IS NULL THEN
        RAISE EXCEPTION 'fundae_id es obligatorio';
    END IF;

    SELECT * INTO f FROM public.fundae_seguimiento WHERE id = p_fundae_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expediente FUNDAE % no existe', p_fundae_id;
    END IF;

    v_email := NULLIF(trim(COALESCE(f.email, '')), '');
    IF v_email IS NULL AND f.lead_id IS NOT NULL THEN
        SELECT NULLIF(trim(COALESCE(l.email, '')), '')
        INTO v_email
        FROM public.leads l
        WHERE l.id = f.lead_id;
    END IF;

    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'No hay email válido para el expediente FUNDAE (indica en el expediente o en el lead)';
    END IF;

    INSERT INTO public.fundae_form_tokens (fundae_id, token, email, expires_at)
    VALUES (p_fundae_id, v_token, v_email, now() + interval '48 hours');

    RETURN jsonb_build_object(
        'token',      v_token,
        'fundae_id',  p_fundae_id,
        'email',      v_email,
        'empresa',    COALESCE(f.empresa, f.razon_social, ''),
        'public_url', v_base || v_token::text
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.send_fundae_form(p_fundae_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF p_fundae_id IS NULL THEN
        RAISE EXCEPTION 'fundae_id (p_fundae_id) es obligatorio';
    END IF;

    v_result := public.issue_fundae_form_token(p_fundae_id);

    UPDATE public.fundae_seguimiento
    SET formulario_enviado = true,
        formulario_pendiente_enviar = true,
        estado = CASE
            WHEN estado IN ('completado', 'cancelado') THEN estado
            ELSE 'en_curso'
        END
    WHERE id = p_fundae_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_fundae_form_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_fundae_form_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_fundae_form_token(uuid) TO service_role;

COMMENT ON FUNCTION public.issue_fundae_form_token(uuid) IS
    'Genera UUID, INSERT en fundae_form_tokens con expires_at +48h.';

REVOKE ALL ON FUNCTION public.send_fundae_form(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_fundae_form(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_fundae_form(uuid) TO service_role;

COMMENT ON FUNCTION public.send_fundae_form(uuid) IS
    'Llama issue_fundae_form_token + marca enviado y pasa expediente a en_curso.';


-- ═══════════════════════════════════════
-- 5. VERIFICACIÓN FINAL
-- ═══════════════════════════════════════

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fundae_seguimiento'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fundae_form_tokens'
ORDER BY ordinal_position;
