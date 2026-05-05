-- Migración: solicitar_fundae_codigo_publico ahora envía el OTP vía Resend
-- (Edge Function send-fundae-otp) en lugar de un webhook a n8n.
--
-- Cambios respecto a fundae_solicitar_codigo_publico_inline_fix.sql:
--   - Se elimina la llamada a v_otp_hook (n8n).
--   - Se llama a la Edge Function send-fundae-otp con autenticación por
--     cabecera x-function-secret (valor leído desde vault.secrets).
--   - El resto de la lógica (validación de token, cooldown, generación OTP,
--     UPDATE de fundae_form_tokens) se mantiene idéntica.
--
-- Requisitos previos (configurados manualmente, no en este archivo):
--   1. Edge Function `send-fundae-otp` desplegada en el proyecto Supabase.
--   2. Secrets de Edge Function (Project → Settings → Edge Functions → Secrets):
--        - RESEND_API_KEY            (API key de Resend con permiso de envío)
--        - SEND_FUNDAE_OTP_SECRET    (secret compartido para autenticar la RPC)
--   3. Secret en Vault de Postgres con el MISMO valor que SEND_FUNDAE_OTP_SECRET:
--        SELECT vault.create_secret(
--          '<el_mismo_valor_que_SEND_FUNDAE_OTP_SECRET>',
--          'send_fundae_otp_secret',
--          'Bearer secret to call the send-fundae-otp Edge Function from RPCs'
--        );

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.solicitar_fundae_codigo_publico(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r              public.fundae_form_tokens%ROWTYPE;
    v_code         text;
    v_num          int;
    v_wait_seconds int;
    v_emp          text;
    v_fn_secret    text;
    v_base    constant text := 'https://panel.afcademia.com/fundae-form/';
    v_fn_url  constant text := 'https://tfwnekfuqxpnezbjcbpj.supabase.co/functions/v1/send-fundae-otp';
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

    v_num  := LEAST((trunc(random() * 1000000))::int, 999999);
    v_code := lpad(v_num::text, 6, '0');

    SELECT COALESCE(NULLIF(trim(f.empresa), ''), NULLIF(trim(f.razon_social), ''), '')
    INTO v_emp
    FROM public.fundae_seguimiento f
    WHERE f.id = r.fundae_id;

    UPDATE public.fundae_form_tokens
    SET verification_code = v_code,
        code_sent_at      = now(),
        attempts          = 0
    WHERE token = p_token;

    SELECT decrypted_secret
      INTO v_fn_secret
      FROM vault.decrypted_secrets
     WHERE name = 'send_fundae_otp_secret'
     LIMIT 1;

    IF v_fn_secret IS NULL THEN
        RAISE WARNING 'send_fundae_otp_secret not found in vault; sending without auth header';
    END IF;

    PERFORM net.http_post(
        url     := v_fn_url,
        headers := jsonb_build_object(
            'Content-Type',     'application/json',
            'x-function-secret', COALESCE(v_fn_secret, '')
        ),
        body    := jsonb_build_object(
            'code',       v_code,
            'email',      r.email,
            'empresa',    CASE WHEN COALESCE(NULLIF(trim(v_emp), ''), '') = '' THEN 'Cliente' ELSE trim(v_emp) END,
            'public_url', v_base || p_token::text
        )
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) TO authenticated;

COMMENT ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) IS
  'Clic «Solicitar código» en FUNDAE público: genera OTP, UPDATE fundae_form_tokens y envía email vía Edge Function send-fundae-otp (Resend).';
