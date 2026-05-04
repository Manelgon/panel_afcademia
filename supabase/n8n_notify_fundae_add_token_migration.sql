-- ============================================================
-- Migración: notify_n8n_fundae incluye token + public_url
-- ────────────────────────────────────────────────────────────
-- Prioridad: si hay salto booleano y estado cambia el mismo UPDATE, action = advance_step
-- Con token/link. Cambio sólo estado → update_status.
-- Cuando el paso detectado es formulario_pendiente_enviar o
-- formulario_enviado, se busca el último row en fundae_form_tokens
-- (send_fundae_form inserta el token antes del UPDATE).
--
-- Ejecutar UNA VEZ en Supabase → SQL Editor
-- ============================================================

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
