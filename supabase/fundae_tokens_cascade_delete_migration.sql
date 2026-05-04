-- ============================================================
-- Migración: al borrar expediente FUNDAE → borrar fundae_form_tokens
-- ────────────────────────────────────────────────────────────
-- 1. FK ON DELETE CASCADE (corrige FKs antiguos sin CASCADE)
-- 2. RLS: permitir DELETE a admins (sin esto CASCADE fallaba)
--
-- Prerrequisito: existe public.is_admin() (schema CRM / schema.sql)
-- Ejecutar UNA VEZ en Supabase → SQL Editor
-- ============================================================

-- Quitar FKs existentes tokens → expediente y recrear con CASCADE
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

COMMENT ON COLUMN public.fundae_form_tokens.fundae_id IS 'Expediente; estos tokens se eliminan al borrar el expediente (CASCADE).';

-- Mismo rol que borra expediente (fundae_delete = is_admin) debe poder borrar hijos por CASCADE
DROP POLICY IF EXISTS "fundae_tokens_delete_admin" ON public.fundae_form_tokens;
CREATE POLICY "fundae_tokens_delete_admin" ON public.fundae_form_tokens
    FOR DELETE TO authenticated
    USING (public.is_admin());
