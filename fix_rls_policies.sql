-- =============================================
-- FIX NUCLEAR: Desactivar y reactivar RLS limpiamente
-- Ejecutar en SQL Editor de Supabase
-- =============================================

-- PASO 1: DESACTIVAR RLS EN TODAS LAS TABLAS
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.segmentacion_despacho DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flujos_embudo DISABLE ROW LEVEL SECURITY;

-- PASO 2: BORRAR TODAS LAS POLÍTICAS EXISTENTES (todas las que puedan existir)
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Borrar todas las políticas de profiles
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on profiles', pol.policyname;
    END LOOP;

    -- Borrar todas las políticas de leads
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'leads' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on leads', pol.policyname;
    END LOOP;

    -- Borrar todas las políticas de segmentacion_despacho
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'segmentacion_despacho' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.segmentacion_despacho', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on segmentacion_despacho', pol.policyname;
    END LOOP;

    -- Borrar todas las políticas de flujos_embudo
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'flujos_embudo' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.flujos_embudo', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on flujos_embudo', pol.policyname;
    END LOOP;
END $$;

-- PASO 3: Recrear is_admin() SECURITY DEFINER (bypass RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- PASO 4: REACTIVAR RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segmentacion_despacho ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flujos_embudo ENABLE ROW LEVEL SECURITY;

-- PASO 5: CREAR POLÍTICAS NUEVAS Y LIMPIAS
-- ==========================================

-- PROFILES: Todos autenticados pueden leer, solo admin puede escribir
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());

-- LEADS: Autenticados leen, anon+auth insertan, solo admin modifica/borra
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated USING (public.is_admin());

-- SEGMENTACION: Igual que leads
CREATE POLICY "seg_select" ON public.segmentacion_despacho FOR SELECT TO authenticated USING (true);
CREATE POLICY "seg_insert" ON public.segmentacion_despacho FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "seg_update" ON public.segmentacion_despacho FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "seg_delete" ON public.segmentacion_despacho FOR DELETE TO authenticated USING (public.is_admin());

-- FLUJOS: Igual que leads
CREATE POLICY "flujos_select" ON public.flujos_embudo FOR SELECT TO authenticated USING (true);
CREATE POLICY "flujos_insert" ON public.flujos_embudo FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "flujos_update" ON public.flujos_embudo FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "flujos_delete" ON public.flujos_embudo FOR DELETE TO authenticated USING (public.is_admin());

-- PASO 6: VERIFICAR - Lista todas las políticas activas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
