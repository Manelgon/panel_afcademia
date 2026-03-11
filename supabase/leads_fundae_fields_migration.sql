-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: Añadir campos de empresa del expediente FUNDAE a la tabla leads
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS razon_social text,
ADD COLUMN IF NOT EXISTS cif text,
ADD COLUMN IF NOT EXISTS telefono_empresa text,
ADD COLUMN IF NOT EXISTS domicilio text,
ADD COLUMN IF NOT EXISTS codigo_postal text,
ADD COLUMN IF NOT EXISTS provincia text,
ADD COLUMN IF NOT EXISTS convenio_referencia text,
ADD COLUMN IF NOT EXISTS cnae text,
ADD COLUMN IF NOT EXISTS ccc text,
ADD COLUMN IF NOT EXISTS num_medio_empleados text,
ADD COLUMN IF NOT EXISTS representante_empresa text,
ADD COLUMN IF NOT EXISTS nif_nie_representante text;

-- Asegurar que los permisos de RLS permitan la actualización de estos campos 
-- por parte del proceso público (anon). Revisamos si existe política para anon.
-- El panel CRM permite a los usuarios admin actualizar los leads. 
-- El paso público necesita poder actualizar el lead desde el formulario.
-- La tabla `leads` debe permitir UPDATE anon o authenticated para los formularios.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'leads' AND policyname = 'leads_update_public'
  ) THEN
    CREATE POLICY "leads_update_public" ON public.leads
      FOR UPDATE TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
