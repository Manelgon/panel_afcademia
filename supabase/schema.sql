-- ══════════════════════════════════════════════════════════════════════
-- SCHEMA COMPLETO: Panel AFCademIA - CRM Core
-- Tablas: profiles, leads, segmentacion_despacho, flujos_embudo
-- Incluye: Funciones, Triggers, RLS, Índices y Realtime
--
-- INSTRUCCIONES:
-- 1. Crear un nuevo proyecto en Supabase
-- 2. Ir a SQL Editor > New Query
-- 3. Pegar TODO este archivo y ejecutar
-- 4. Configurar .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
-- ══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════
-- 1. FUNCIONES AUXILIARES
-- ═══════════════════════════════════════

-- 1.1 Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 1.2 Función is_admin() — SECURITY DEFINER (bypass RLS)
-- Se usa en las políticas RLS para verificar si el usuario es admin
-- sin causar recursión infinita al consultar la tabla profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;


-- ═══════════════════════════════════════
-- 2. TABLA: profiles (Usuarios del panel)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
    id              uuid          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre          text,
    email           text          UNIQUE,
    avatar_url      text,
    role            text          DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    fecha_creacion  timestamptz   DEFAULT now(),
    updated_at      timestamptz   DEFAULT now()
);

COMMENT ON TABLE  public.profiles IS 'Perfiles de usuario vinculados a auth.users';
COMMENT ON COLUMN public.profiles.role IS 'Rol del usuario: admin o user';

-- Trigger: auto-update de updated_at
DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- Trigger: crear perfil automáticamente al registrarse un usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, email, role)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data->>'nombre',
      new.raw_user_meta_data->>'full_name',
      'Nuevo Usuario'
    ),
    new.email,
    'user'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ═══════════════════════════════════════
-- 3. TABLA: leads (Prospectos / Contactos)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.leads (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre            text        NOT NULL,
    email             text        NOT NULL UNIQUE,
    whatsapp          text,
    empresa_nombre    text,
    ciudad            text,
    ip_address        text,
    source            text        DEFAULT 'Landing Page',
    fecha_creacion    timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

COMMENT ON TABLE  public.leads IS 'Leads/prospectos capturados desde la landing page o creados manualmente';
COMMENT ON COLUMN public.leads.source IS 'Origen del lead: Landing Page, Manual, Referido, etc.';
COMMENT ON COLUMN public.leads.ip_address IS 'IP del visitante al enviar el formulario (capturada server-side)';

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_fecha_creacion ON public.leads(fecha_creacion DESC);

-- Trigger: auto-update de updated_at
DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();


-- ═══════════════════════════════════════
-- 4. TABLA: segmentacion_despacho (Perfil del Negocio)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.segmentacion_despacho (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                 uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    num_comunidades         text,       -- '1-10', '11-50', '50+'
    interes_fundae          boolean     DEFAULT false,
    software_actual         text,
    objetivo_automatizacion text,
    UNIQUE(lead_id)         -- Un lead solo puede tener una segmentación
);

COMMENT ON TABLE  public.segmentacion_despacho IS 'Datos de segmentación del despacho asociado al lead';
COMMENT ON COLUMN public.segmentacion_despacho.num_comunidades IS 'Rango de comunidades: 1-10, 11-50, 50+';
COMMENT ON COLUMN public.segmentacion_despacho.interes_fundae IS 'Si el despacho tiene interés en formación FUNDAE';


-- ═══════════════════════════════════════
-- 5. TABLA: flujos_embudo (Estado y Seguimiento del Lead)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.flujos_embudo (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                     uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    nombre_flujo                text        DEFAULT 'formulario web',
    status_actual               text        DEFAULT 'nuevo' 
                                CHECK (status_actual IN ('nuevo', 'en_proceso', 'contactado', 'convertido', 'perdido')),
    actividad                   text        DEFAULT 'lead_inactivo',   -- 'lead_activo' | 'lead_inactivo'
    keyword_recibida            text,                        -- Palabra clave recibida por email/whatsapp
    tags_proceso                jsonb       DEFAULT '[]'::jsonb,  -- Array de tags: ['email_enviado', 'respondido', ...]
    fecha_ultima_interaccion    timestamptz DEFAULT now()
);

COMMENT ON TABLE  public.flujos_embudo IS 'Estado del lead en el embudo de ventas y tags de seguimiento';
COMMENT ON COLUMN public.flujos_embudo.status_actual IS 'Estado: nuevo, en_proceso, contactado, convertido, perdido';
COMMENT ON COLUMN public.flujos_embudo.actividad IS 'Actividad del lead: lead_activo, lead_inactivo o NULL';
COMMENT ON COLUMN public.flujos_embudo.tags_proceso IS 'Array JSON con el historial de tags de proceso';
COMMENT ON COLUMN public.flujos_embudo.keyword_recibida IS 'Keyword recibida por el lead (ej: "IA" en campaña de email)';

-- Índice para filtrar por estado rápidamente
CREATE INDEX IF NOT EXISTS idx_flujos_status ON public.flujos_embudo(status_actual);
CREATE INDEX IF NOT EXISTS idx_flujos_lead_id ON public.flujos_embudo(lead_id);


-- ═══════════════════════════════════════
-- 6. POLÍTICAS RLS (Row Level Security)
-- ═══════════════════════════════════════
--
-- REGLAS:
-- ┌────────────────────┬─────────┬─────────┬─────────┬─────────┐
-- │ Tabla              │ SELECT  │ INSERT  │ UPDATE  │ DELETE  │
-- ├────────────────────┼─────────┼─────────┼─────────┼─────────┤
-- │ profiles           │ auth    │ admin   │ own/adm │ admin   │
-- │ leads              │ auth    │ any*    │ admin   │ admin   │
-- │ segmentacion       │ auth    │ any*    │ admin   │ admin   │
-- │ flujos_embudo      │ auth    │ any*    │ admin   │ admin   │
-- └────────────────────┴─────────┴─────────┴─────────┴─────────┘
-- auth = cualquier usuario autenticado
-- any* = anon (landing page) + autenticados
-- own/adm = el propio usuario O un admin
--
-- ⚠️ IMPORTANTE: NO usar FOR ALL — causa evaluación redundante de is_admin()
-- en SELECT, provocando lentitud/recursión. Siempre separar por operación.
-- ═══════════════════════════════════════

-- 6.1 PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- 6.2 LEADS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "leads_insert" ON public.leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "leads_delete" ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- 6.3 SEGMENTACION_DESPACHO
ALTER TABLE public.segmentacion_despacho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seg_select" ON public.segmentacion_despacho
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "seg_insert" ON public.segmentacion_despacho
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "seg_update" ON public.segmentacion_despacho
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "seg_delete" ON public.segmentacion_despacho
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- 6.4 FLUJOS_EMBUDO
ALTER TABLE public.flujos_embudo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flujos_select" ON public.flujos_embudo
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "flujos_insert" ON public.flujos_embudo
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "flujos_update" ON public.flujos_embudo
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "flujos_delete" ON public.flujos_embudo
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ═══════════════════════════════════════
-- 7. REALTIME (Sincronización en tiempo real)
-- ═══════════════════════════════════════

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE
    public.profiles,
    public.leads,
    public.flujos_embudo,
    public.segmentacion_despacho;
COMMIT;


-- ═══════════════════════════════════════
-- 8. DATOS INICIALES (Opcional)
-- ═══════════════════════════════════════
-- Después de ejecutar este SQL:
-- 1. Crear un usuario desde Authentication > Users > Add User
-- 2. Ejecutar el siguiente SQL para hacerlo admin:
--
-- UPDATE public.profiles 
-- SET role = 'admin', nombre = 'Admin'
-- WHERE email = 'TU_EMAIL@gmail.com';


-- ═══════════════════════════════════════
-- 9. VERIFICACIÓN
-- ═══════════════════════════════════════

-- Verificar tablas creadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'leads', 'segmentacion_despacho', 'flujos_embudo')
ORDER BY table_name;

-- Verificar políticas RLS (debería haber 16: 4 por tabla)
SELECT tablename, policyname, cmd, roles
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'leads', 'segmentacion_despacho', 'flujos_embudo')
ORDER BY tablename, cmd;
