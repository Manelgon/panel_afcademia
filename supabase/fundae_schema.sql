-- ══════════════════════════════════════════════════════════════════════
-- SCHEMA FUNDAE: Seguimiento de formación FUNDAE
-- Tabla: fundae_seguimiento
-- ══════════════════════════════════════════════════════════════════════
--
-- FLUJO DE ESTADOS:
--   0. formulario_pendiente_enviar → El formulario está listo para enviarse
--   1. formulario_enviado      → Se envía el formulario al cliente
--   2. formulario_recibido     → El cliente lo recibe y cumplimenta
--   3. creditos_verificados    → Se verifica si tiene créditos FUNDAE
--   4. factura_enviada         → Se envía la factura al cliente
--   5. factura_pagada          → El cliente paga la factura
--   6. ficha_alumno_enviada    → Se envía la ficha de alumno
--
-- INSTRUCCIONES:
-- 1. Ir a Supabase > SQL Editor > New Query
-- 2. Pegar TODO este archivo y ejecutar
-- ══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- 1. TABLA: fundae_seguimiento
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fundae_seguimiento (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                 bigint      REFERENCES public.leads(id) ON DELETE SET NULL,

    -- Datos de empresa para FUNDAE (Formulario Oficial)
    empresa                 text,
    razon_social            text,
    cif                     text,
    email                   text,
    telefono                text,
    domicilio               text,
    poblacion               text,
    codigo_postal           text,
    provincia               text,
    convenio_referencia     text,
    cnae                    text,
    ccc                     text,
    num_medio_empleados     text,
    representante_empresa   text,
    nif_nie_representante   text,

    -- Datos financieros
    creditos_fundae         numeric     DEFAULT 0,
    facturado               numeric     DEFAULT 0,
    pagado                  numeric     DEFAULT 0,
    num_asistentes          integer     DEFAULT 0,

    -- Estado general del expediente
    estado                  text        DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'en_curso', 'completado', 'incidencia', 'cancelado')),

    -- Notas / dudas / incidencias
    comentarios             text,

    -- Timestamps
    fecha_inicio            timestamptz DEFAULT now(),
    updated_at              timestamptz DEFAULT now()
);

-- ── MIGRACIONES / ACTUALIZACIONES ──────────────────────────────────

-- 1. Asegurar tipo bigint para lead_id (compatibilidad con tabla leads)
ALTER TABLE public.fundae_seguimiento ALTER COLUMN lead_id TYPE bigint;

-- 2. Añadir columnas del flujo de estados si no existen
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS formulario_pendiente_enviar boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS formulario_enviado          boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS formulario_recibido         boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS creditos_verificados        boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS factura_enviada             boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS factura_pagada              boolean DEFAULT false;
ALTER TABLE public.fundae_seguimiento ADD COLUMN IF NOT EXISTS ficha_alumno_enviada        boolean DEFAULT false;
-- ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE  public.fundae_seguimiento IS 'Seguimiento de expedientes FUNDAE. Flujo: formulario → verificación créditos → factura → pago → ficha alumno';
COMMENT ON COLUMN public.fundae_seguimiento.lead_id IS 'Lead de origen (convertido con interes_fundae=true)';
COMMENT ON COLUMN public.fundae_seguimiento.formulario_pendiente_enviar IS '0. El formulario está pendiente de enviar';
COMMENT ON COLUMN public.fundae_seguimiento.formulario_enviado IS '1. Se envió el formulario al cliente';
COMMENT ON COLUMN public.fundae_seguimiento.formulario_recibido IS '2. El cliente devolvió el formulario cumplimentado';
COMMENT ON COLUMN public.fundae_seguimiento.creditos_verificados IS '3. Se verificó que el cliente tiene créditos FUNDAE';
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
CREATE INDEX IF NOT EXISTS idx_fundae_lead_id ON public.fundae_seguimiento(lead_id);
CREATE INDEX IF NOT EXISTS idx_fundae_estado ON public.fundae_seguimiento(estado);


-- ═══════════════════════════════════════
-- 2. RLS (Row Level Security)
-- ═══════════════════════════════════════

ALTER TABLE public.fundae_seguimiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fundae_select" ON public.fundae_seguimiento
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "fundae_insert" ON public.fundae_seguimiento
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "fundae_update" ON public.fundae_seguimiento
  FOR UPDATE TO authenticated
  USING (true);

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
CREATE INDEX IF NOT EXISTS idx_fundae_form_tokens_token ON public.fundae_form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_fundae_form_tokens_fundae_id ON public.fundae_form_tokens(fundae_id);

-- RLS
ALTER TABLE public.fundae_form_tokens ENABLE ROW LEVEL SECURITY;

-- Lectura pública por token (página pública puede verificar)
CREATE POLICY "fundae_tokens_select_by_token" ON public.fundae_form_tokens
    FOR SELECT USING (true);

-- Update público (incrementar attempts, marcar verified/used)
CREATE POLICY "fundae_tokens_update_by_token" ON public.fundae_form_tokens
    FOR UPDATE USING (true);

-- Insert solo desde service_role (n8n)
CREATE POLICY "fundae_tokens_insert_service" ON public.fundae_form_tokens
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Delete solo desde service_role
CREATE POLICY "fundae_tokens_delete_service" ON public.fundae_form_tokens
    FOR DELETE USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════
-- 5. VERIFICACIÓN
-- ═══════════════════════════════════════

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fundae_seguimiento'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fundae_form_tokens'
ORDER BY ordinal_position;
