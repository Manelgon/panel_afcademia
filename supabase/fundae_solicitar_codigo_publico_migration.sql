-- RPC ejecutable desde el formulario público (anon): un clic guarda verification_code en BD
-- y opcionalmente dispara pg_net → webhook n8n para el email del código.

CREATE EXTENSION IF NOT EXISTS pg_net;

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
