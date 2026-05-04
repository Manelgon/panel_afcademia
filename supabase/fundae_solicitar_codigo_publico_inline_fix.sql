-- Fix: la función solicitar_fundae_codigo_publico llamaba a
-- public.request_fundae_verification_code, que NO existe en la base de datos
-- (la migración fundae_request_verification_code_migration.sql nunca se aplicó).
-- Resultado: al pulsar «Solicitar código» fallaba el RPC y verification_code
-- se quedaba a NULL en fundae_form_tokens.
--
-- Esta migración consolida toda la lógica del OTP dentro de
-- solicitar_fundae_codigo_publico (sin dependencias externas) y vuelve a
-- otorgar EXECUTE a anon/authenticated.

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
    v_base    constant text := 'https://panel.afcademia.com/fundae-form/';
    v_otp_hook constant text := 'https://serinwebhook.afcademia.com/webhook/cdb06810-28dd-4898-a757-d39fd586fb49';
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

    PERFORM net.http_post(
        url     := v_otp_hook,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
            'otp_email',  true,
            'code',       v_code,
            'email',      r.email,
            'empresa',    CASE WHEN COALESCE(NULLIF(trim(v_emp), ''), '') = '' THEN 'Cliente' ELSE trim(v_emp) END,
            'public_url', v_base || p_token::text,
            'token',      p_token::text
        )
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) TO authenticated;

COMMENT ON FUNCTION public.solicitar_fundae_codigo_publico(uuid) IS
  'Clic «Solicitar código» en FUNDAE público: genera OTP, UPDATE fundae_form_tokens y dispara webhook n8n.';
