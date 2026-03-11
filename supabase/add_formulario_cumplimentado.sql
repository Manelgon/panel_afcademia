-- =============================================
-- Añadir columna formulario_cumplimentado
-- Ejecutar en Supabase → SQL Editor
-- =============================================

ALTER TABLE public.fundae_seguimiento
ADD COLUMN IF NOT EXISTS formulario_cumplimentado BOOLEAN DEFAULT false;
