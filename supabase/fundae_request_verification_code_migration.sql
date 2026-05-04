-- RPC: generar código OTP y guardarlo (UPDATE fundae_form_tokens).
-- n8n (webhook VITE_CODIGO_FUNDAE) debe llamar solo esta función con service_role,
-- no INSERT ni SQL concatenado.

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
