-- ============================================================
-- issue_fundae_form_token — genera UUID y guarda en fundae_form_tokens
-- send_fundae_form — lo anterior + marca enviado + estado en_curso (salvo completado/cancelado)
--
-- Ejecutar en Supabase → SQL Editor (sustituye send_fundae_form solo-uuid)
-- ============================================================

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

REVOKE ALL ON FUNCTION public.send_fundae_form(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_fundae_form(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_fundae_form(uuid) TO service_role;

COMMENT ON FUNCTION public.issue_fundae_form_token(uuid) IS
    'Genera UUID, INSERT en fundae_form_tokens con expires_at +48h.';
COMMENT ON FUNCTION public.send_fundae_form(uuid) IS
    'Llama issue_fundae_form_token + marca enviado + en_curso.';
