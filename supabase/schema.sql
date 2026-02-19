-- =============================================
-- SCHEMA COMPLETO: Panel Automatizatelo
-- Supabase Self-Hosted
-- =============================================
-- Ejecutar este archivo en el SQL Editor de Supabase
-- para crear/recrear todas las tablas y políticas.
-- =============================================


-- =============================================
-- 1. TIPOS ENUM
-- =============================================

-- Tipo para roles de usuario
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('user', 'editor', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Tipo para estado de cuenta
DO $$ BEGIN
    CREATE TYPE public.user_status AS ENUM ('active', 'banned');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- =============================================
-- 2. TABLA: users (Perfiles de usuario)
-- =============================================
-- Vinculada a auth.users por id (uuid)

CREATE TABLE IF NOT EXISTS public.users (
    id            uuid          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email         text          NOT NULL UNIQUE,
    avatar_url    text,
    role          user_role     DEFAULT 'user',
    name          text,
    first_name    text,
    second_name   text,
    birth_date    date,
    phone_prefix  text          DEFAULT '+34',
    phone         text,
    country       text          DEFAULT 'España',
    province      text,
    city          text,
    address       text,
    status        user_status   DEFAULT 'active',
    created_at    timestamptz   DEFAULT now(),
    updated_at    timestamptz   DEFAULT now()
);

-- Si la tabla ya existe, añadir columnas nuevas (idempotente)
DO $$ BEGIN
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_date    date;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_prefix  text DEFAULT '+34';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone         text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country       text DEFAULT 'España';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS province      text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city          text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address       text;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status        user_status DEFAULT 'active';
END $$;

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_users ON public.users;
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();


-- =============================================
-- 3. TABLA: leads (Contactos / Leads)
-- =============================================

CREATE TABLE IF NOT EXISTS public.leads (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name        text        NOT NULL,
    last_name         text        NOT NULL,
    phone             text        NOT NULL,
    email             text        NOT NULL,
    client_type       text,
    service_interest  text,
    message           text,
    privacy_accepted  boolean     DEFAULT false,
    source            text,
    score             int4        DEFAULT 0,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();


-- =============================================
-- 4. ELIMINAR TRIGGERS PROBLEMÁTICOS
-- =============================================
-- IMPORTANTE: No usar trigger automático para crear perfil
-- en public.users desde auth.users. Lo hacemos manualmente
-- desde el frontend para incluir todos los campos.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();


-- =============================================
-- 5. POLÍTICAS RLS - TABLA users
-- =============================================
-- Activar RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "Admins can update any profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can read all" ON public.users;
DROP POLICY IF EXISTS "Authenticated users can insert" ON public.users;
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Users can delete own" ON public.users;
DROP POLICY IF EXISTS "Users can delete own record" ON public.users;
DROP POLICY IF EXISTS "Allow read access" ON public.users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON public.users;
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;
DROP POLICY IF EXISTS "users_insert_authenticated" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_delete_own" ON public.users;

-- SELECT: Usuarios autenticados pueden ver todos los perfiles
-- (no causa recursión porque usa auth.uid() directo, sin sub-query a users)
CREATE POLICY "users_select_authenticated"
    ON public.users FOR SELECT
    TO authenticated
    USING (true);

-- INSERT: Usuarios autenticados pueden insertar perfiles
-- (WITH CHECK true porque solo admins acceden a la página de gestión)
CREATE POLICY "users_insert_authenticated"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE: Usuarios pueden actualizar su propio perfil
CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- DELETE: Usuarios pueden eliminar su propio perfil
CREATE POLICY "users_delete_own"
    ON public.users FOR DELETE
    TO authenticated
    USING (auth.uid() = id);


-- =============================================
-- 6. POLÍTICAS RLS - TABLA leads
-- =============================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "leads_select_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
DROP POLICY IF EXISTS "leads_update_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;

-- SELECT: Solo usuarios autenticados pueden ver leads
CREATE POLICY "leads_select_authenticated"
    ON public.leads FOR SELECT
    TO authenticated
    USING (true);

-- INSERT: Cualquiera puede crear un lead (formulario público del sitio web)
CREATE POLICY "leads_insert_anon"
    ON public.leads FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- UPDATE: Solo usuarios autenticados pueden editar leads
CREATE POLICY "leads_update_authenticated"
    ON public.leads FOR UPDATE
    TO authenticated
    USING (true);

-- DELETE: Solo usuarios autenticados pueden eliminar leads
CREATE POLICY "leads_delete_authenticated"
    ON public.leads FOR DELETE
    TO authenticated
    USING (true);


-- =============================================
-- 9. TABLA: services (Catálogo de Servicios)
-- =============================================

CREATE TABLE IF NOT EXISTS public.services (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text          NOT NULL,
    description   text,
    price         decimal(10,2),
    is_active     boolean       DEFAULT true,
    created_at    timestamptz   DEFAULT now(),
    updated_at    timestamptz   DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_services_name ON public.services(name);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(is_active);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_services ON public.services;
CREATE TRIGGER set_updated_at_services
    BEFORE UPDATE ON public.services
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();


-- =============================================
-- 10. POLÍTICAS RLS - TABLA services
-- =============================================
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes
DROP POLICY IF EXISTS "services_select_authenticated" ON public.services;
DROP POLICY IF EXISTS "services_all_admin" ON public.services;

-- SELECT: Todos los usuarios autenticados pueden ver servicios
CREATE POLICY "services_select_authenticated"
    ON public.services FOR SELECT
    TO authenticated
    USING (true);

-- ALL: Solo administradores pueden insertar, actualizar o eliminar servicios
CREATE POLICY "services_all_admin"
    ON public.services FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );


-- =============================================
-- 11. HABILITAR REALTIME (Actualizado)
-- =============================================
-- Asegurar que las tablas están en la publicación de realtime

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'leads') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'services') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
    END IF;
END $$;


-- =============================================
-- VERIFICACIÓN
-- =============================================
-- Ejecutar después de todo lo anterior para verificar:

-- Ver tablas creadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Ver políticas activas
SELECT tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE schemaname = 'public';

-- Ver triggers (debe estar vacío para auth.users)
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_schema = 'auth';
