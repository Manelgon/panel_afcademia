-- ============================================================
-- Tabla: fundae_form_tokens
-- Tokens de acceso + códigos de verificación para el formulario
-- público FUNDAE que rellenan los leads/empresas.
-- ============================================================

-- 1. TABLA
CREATE TABLE IF NOT EXISTS public.fundae_form_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fundae_id UUID NOT NULL REFERENCES public.fundae_seguimiento(id) ON DELETE CASCADE,
    token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    verification_code VARCHAR(6),              -- NULL hasta que el lead solicite código
    email VARCHAR(255) NOT NULL,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    verified BOOLEAN DEFAULT false,
    used BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '48 hours'),
    created_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ,
    code_sent_at TIMESTAMPTZ                   -- Cooldown 5 min para regenerar código
);

-- 2. COMENTARIOS
COMMENT ON TABLE  public.fundae_form_tokens IS 'Tokens de verificación para formularios FUNDAE públicos';
COMMENT ON COLUMN public.fundae_form_tokens.token IS 'UUID único que va en la URL del enlace público';
COMMENT ON COLUMN public.fundae_form_tokens.verification_code IS 'Código de 6 dígitos enviado por email';
COMMENT ON COLUMN public.fundae_form_tokens.attempts IS 'Número de intentos de verificación fallidos';
COMMENT ON COLUMN public.fundae_form_tokens.max_attempts IS 'Máximo de intentos permitidos (default 5)';
COMMENT ON COLUMN public.fundae_form_tokens.verified IS 'true cuando el código se verificó correctamente';
COMMENT ON COLUMN public.fundae_form_tokens.used IS 'true cuando el formulario fue completado y enviado';
COMMENT ON COLUMN public.fundae_form_tokens.expires_at IS 'El enlace expira 48h después de crearse';

-- 3. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_fundae_form_tokens_token ON public.fundae_form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_fundae_form_tokens_fundae_id ON public.fundae_form_tokens(fundae_id);

-- 4. ROW LEVEL SECURITY
ALTER TABLE public.fundae_form_tokens ENABLE ROW LEVEL SECURITY;

-- Lectura pública por token (para que la página pública pueda verificar)
CREATE POLICY "fundae_tokens_select_by_token" ON public.fundae_form_tokens
    FOR SELECT USING (true);

-- Update público (para incrementar attempts, marcar verified/used)
CREATE POLICY "fundae_tokens_update_by_token" ON public.fundae_form_tokens
    FOR UPDATE USING (true);

-- Insert solo desde service_role (n8n)
CREATE POLICY "fundae_tokens_insert_service" ON public.fundae_form_tokens
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Delete solo desde service_role
CREATE POLICY "fundae_tokens_delete_service" ON public.fundae_form_tokens
    FOR DELETE USING (auth.role() = 'service_role');
