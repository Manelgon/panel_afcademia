-- =============================================
-- SCHEMA COMPLETO: Panel AFCademIA
-- Basado en afc-landing y panel_afclanding
-- =============================================

-- =============================================
-- 1. TIPOS ENUM
-- =============================================

DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('user', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. TABLA: profiles (Perfiles de usuario)
-- =============================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id            uuid          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre        text,
    email         text          UNIQUE,
    avatar_url    text,
    role          public.user_role     DEFAULT 'user',
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamptz   DEFAULT now()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- Trigger para crear perfil al registrarse en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, email, role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'), new.email, 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 3. TABLA: leads (Contactos / Prospectos)
-- =============================================

CREATE TABLE IF NOT EXISTS public.leads (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre            text        NOT NULL,
    email             text        NOT NULL UNIQUE,
    whatsapp          text,
    empresa_nombre    text,
    ciudad            text,
    ip_address        text,
    source            text        DEFAULT 'Landing Page',
    fecha_creacion    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at        timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_fecha_creacion ON public.leads(fecha_creacion DESC);

DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- 4. TABLA: segmentacion_despacho (El Perfil del Negocio)
-- =============================================

CREATE TABLE IF NOT EXISTS public.segmentacion_despacho (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id           uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    num_comunidades   text,       -- '1-10', '11-50', '50+'
    interes_fundae    boolean     DEFAULT false,
    software_actual   text,
    objetivo_automatizacion text,
    UNIQUE(lead_id)
);

-- =============================================
-- 5. TABLA: flujos_embudo (Estado y Seguimiento)
-- =============================================

CREATE TABLE IF NOT EXISTS public.flujos_embudo (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id           uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    nombre_flujo      text        DEFAULT 'formulario web',
    status_actual     text        DEFAULT 'nuevo' CHECK (status_actual IN ('nuevo', 'en_proceso', 'contactado', 'convertido', 'perdido')),
    actividad         text,       -- 'lead_activo' or 'lead_inactivo' or null
    keyword_recibida  text,
    fecha_ultima_interaccion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tags_proceso      jsonb       DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_flujos_status ON public.flujos_embudo(status_actual);

-- =============================================
-- 6. SEGURIDAD: Función is_admin (Antirecursión)
-- =============================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT (role = 'admin')
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- 7. POLÍTICAS RLS - profiles
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_auth" ON public.profiles;
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;

CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());

-- =============================================
-- 8. POLÍTICAS RLS - leads, segmentacion, flujos
-- =============================================

-- Leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_select_auth" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_public" ON public.leads;
DROP POLICY IF EXISTS "leads_admin_all" ON public.leads;

CREATE POLICY "leads_select_auth" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads_insert_public" ON public.leads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "leads_admin_all" ON public.leads FOR ALL TO authenticated USING (public.is_admin());

-- Segmentacion
ALTER TABLE public.segmentacion_despacho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seg_select_auth" ON public.segmentacion_despacho;
DROP POLICY IF EXISTS "seg_insert_public" ON public.segmentacion_despacho;
DROP POLICY IF EXISTS "seg_admin_all" ON public.segmentacion_despacho;

CREATE POLICY "seg_select_auth" ON public.segmentacion_despacho FOR SELECT TO authenticated USING (true);
CREATE POLICY "seg_insert_public" ON public.segmentacion_despacho FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "seg_admin_all" ON public.segmentacion_despacho FOR ALL TO authenticated USING (public.is_admin());

-- Flujos
ALTER TABLE public.flujos_embudo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flujos_select_auth" ON public.flujos_embudo;
DROP POLICY IF EXISTS "flujos_insert_public" ON public.flujos_embudo;
DROP POLICY IF EXISTS "flujos_admin_all" ON public.flujos_embudo;

CREATE POLICY "flujos_select_auth" ON public.flujos_embudo FOR SELECT TO authenticated USING (true);
CREATE POLICY "flujos_insert_public" ON public.flujos_embudo FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "flujos_admin_all" ON public.flujos_embudo FOR ALL TO authenticated USING (public.is_admin());

-- =============================================
-- 9. REALTIME
-- =============================================

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE 
    public.profiles, 
    public.leads, 
    public.flujos_embudo, 
    public.segmentacion_despacho;
COMMIT;
