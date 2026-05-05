-- ================================================================
-- Migración: company_settings + bucket doc-assets
-- Datos del emisor (textos) e imágenes (logo, header, firma) usados
-- en PDFs y otros documentos generados por la app.
--
-- Ejecutar UNA VEZ en Supabase → SQL Editor (postgres role).
-- Idempotente.
-- ================================================================

-- ─── 1. Tabla company_settings (clave/valor) ────────────────────
CREATE TABLE IF NOT EXISTS public.company_settings (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key   text NOT NULL UNIQUE,
    setting_value text NOT NULL DEFAULT '',
    updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado lee (la firma se sirve por bucket público al anon)
DROP POLICY IF EXISTS "company_settings_select_authenticated" ON public.company_settings;
CREATE POLICY "company_settings_select_authenticated"
    ON public.company_settings FOR SELECT
    TO authenticated
    USING (true);

-- INSERT/UPDATE/DELETE: solo admin
DROP POLICY IF EXISTS "company_settings_insert_admin" ON public.company_settings;
CREATE POLICY "company_settings_insert_admin"
    ON public.company_settings FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "company_settings_update_admin" ON public.company_settings;
CREATE POLICY "company_settings_update_admin"
    ON public.company_settings FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "company_settings_delete_admin" ON public.company_settings;
CREATE POLICY "company_settings_delete_admin"
    ON public.company_settings FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Seed inicial (vacíos; el admin los rellena desde la UI)
INSERT INTO public.company_settings (setting_key, setting_value) VALUES
    ('emisor_name',      ''),
    ('emisor_address',   ''),
    ('emisor_city',      ''),
    ('emisor_cp',        ''),
    ('emisor_cif',       ''),
    ('emisor_phone',     ''),
    ('colegiado_nombre', ''),
    ('colegio_ciudad',   ''),
    ('emisor_iban',      ''),
    ('logo_path',        ''),
    ('firma_path',       ''),
    ('header_path',      '')
ON CONFLICT (setting_key) DO NOTHING;

-- ─── 2. Bucket doc-assets (público para lectura) ─────────────────
-- Público para que el formulario FUNDAE (anon) pueda inyectar la firma en el PDF.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'doc-assets',
    'doc-assets',
    true,
    5242880,
    ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 3. Políticas storage.objects para doc-assets ────────────────
-- Lectura pública (SELECT) — necesaria para el form público (anon)
DROP POLICY IF EXISTS "doc_assets_public_read" ON storage.objects;
CREATE POLICY "doc_assets_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'doc-assets');

-- Escritura solo admin (INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "doc_assets_admin_insert" ON storage.objects;
CREATE POLICY "doc_assets_admin_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'doc-assets' AND public.is_admin());

DROP POLICY IF EXISTS "doc_assets_admin_update" ON storage.objects;
CREATE POLICY "doc_assets_admin_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'doc-assets' AND public.is_admin())
    WITH CHECK (bucket_id = 'doc-assets' AND public.is_admin());

DROP POLICY IF EXISTS "doc_assets_admin_delete" ON storage.objects;
CREATE POLICY "doc_assets_admin_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'doc-assets' AND public.is_admin());
