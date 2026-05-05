-- Migración: el trigger sobre fundae_form_tokens (INSERT) ahora llama a la
-- Edge Function send-fundae-form-link (Resend) en lugar de a un webhook n8n.
--
-- Antes:
--   Trigger "Enviar Token FUNDAE a n8n" usaba supabase_functions.http_request()
--   para hacer POST a serinwebhook.afcademia.com/webhook/14a009a7-...
--
-- Ahora:
--   Trigger fundae_form_tokens_send_email → notify_fundae_form_token_email()
--   → POST asíncrono (pg_net) a la Edge Function send-fundae-form-link.
--
-- La función trigger:
--   - Lee la empresa desde fundae_seguimiento (JOIN por NEW.fundae_id).
--   - Calcula el public_url panel.afcademia.com/fundae-form/<token>.
--   - Lee el secret de Vault y lo manda en cabecera x-function-secret.
--   - Hace net.http_post asíncrono (no bloquea el INSERT).
--
-- Requisitos previos (configurados manualmente, no en este archivo):
--   1. Edge Function `send-fundae-form-link` desplegada en el proyecto.
--   2. Secrets en Edge Functions (Project → Settings → Edge Functions → Secrets):
--        - RESEND_API_KEY
--        - SEND_FUNDAE_FORM_LINK_SECRET   (secret compartido para autenticar el trigger)
--   3. Secret en Vault de Postgres con el MISMO valor que SEND_FUNDAE_FORM_LINK_SECRET:
--        SELECT vault.create_secret(
--          '<el_mismo_valor_que_SEND_FUNDAE_FORM_LINK_SECRET>',
--          'send_fundae_form_link_secret',
--          'Bearer secret to call the send-fundae-form-link Edge Function from triggers'
--        );

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_fundae_form_token_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa     text;
    v_fn_secret   text;
    v_public_url  text;
    v_base    constant text := 'https://panel.afcademia.com/fundae-form/';
    v_fn_url  constant text := 'https://tfwnekfuqxpnezbjcbpj.supabase.co/functions/v1/send-fundae-form-link';
BEGIN
    IF NEW.token IS NULL OR NEW.email IS NULL OR trim(NEW.email) = '' THEN
        RETURN NEW;
    END IF;

    v_public_url := v_base || NEW.token::text;

    SELECT COALESCE(NULLIF(trim(f.empresa), ''), NULLIF(trim(f.razon_social), ''), '')
    INTO v_empresa
    FROM public.fundae_seguimiento f
    WHERE f.id = NEW.fundae_id;

    SELECT decrypted_secret
      INTO v_fn_secret
      FROM vault.decrypted_secrets
     WHERE name = 'send_fundae_form_link_secret'
     LIMIT 1;

    IF v_fn_secret IS NULL THEN
        RAISE WARNING 'send_fundae_form_link_secret not found in vault; sending without auth header';
    END IF;

    PERFORM net.http_post(
        url     := v_fn_url,
        headers := jsonb_build_object(
            'Content-Type',     'application/json',
            'x-function-secret', COALESCE(v_fn_secret, '')
        ),
        body    := jsonb_build_object(
            'email',      NEW.email,
            'empresa',    CASE WHEN COALESCE(NULLIF(trim(v_empresa), ''), '') = '' THEN 'Administrador' ELSE trim(v_empresa) END,
            'public_url', v_public_url
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Enviar Token FUNDAE a n8n" ON public.fundae_form_tokens;
DROP TRIGGER IF EXISTS fundae_form_tokens_send_email ON public.fundae_form_tokens;

CREATE TRIGGER fundae_form_tokens_send_email
    AFTER INSERT ON public.fundae_form_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_fundae_form_token_email();

COMMENT ON FUNCTION public.notify_fundae_form_token_email() IS
  'Trigger AFTER INSERT en fundae_form_tokens: dispara Edge Function send-fundae-form-link (Resend) para enviar al cliente el email con el enlace al formulario.';
