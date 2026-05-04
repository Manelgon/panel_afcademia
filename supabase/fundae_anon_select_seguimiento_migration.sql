-- Formulario público FUNDAE: permite leer expediente enlazado al token (embed en query).
-- Sin esto: .select('*, fundae_seguimiento(*)') como anon falla → "Enlace no válido".
-- Ejecutar UNA VEZ en Supabase → SQL Editor.

DROP POLICY IF EXISTS "fundae_select_public" ON public.fundae_seguimiento;
CREATE POLICY "fundae_select_public" ON public.fundae_seguimiento
  FOR SELECT TO anon
  USING (true);
