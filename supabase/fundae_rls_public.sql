-- =============================================
-- SQL para permitir al formulario público guardar datos
-- Ejecutar en Supabase → SQL Editor
-- =============================================

-- Permitir al usuario anónimo (formulario público) actualizar fundae_seguimiento
DROP POLICY IF EXISTS "fundae_update_public" ON public.fundae_seguimiento;
CREATE POLICY "fundae_update_public" ON public.fundae_seguimiento
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Permitir al usuario anónimo actualizar fundae_form_tokens (marcar como used)
DROP POLICY IF EXISTS "fundae_tokens_update_public" ON public.fundae_form_tokens;
CREATE POLICY "fundae_tokens_update_public" ON public.fundae_form_tokens
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Permitir al usuario anónimo leer con .select() después del update
DROP POLICY IF EXISTS "fundae_select_public" ON public.fundae_seguimiento;
CREATE POLICY "fundae_select_public" ON public.fundae_seguimiento
  FOR SELECT TO anon
  USING (true);
