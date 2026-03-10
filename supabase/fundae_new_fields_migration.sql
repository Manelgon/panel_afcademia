-- Migración para añadir los campos al formulario público en fundae_seguimiento

ALTER TABLE public.fundae_seguimiento
ADD COLUMN IF NOT EXISTS razon_social text,
ADD COLUMN IF NOT EXISTS domicilio text,
ADD COLUMN IF NOT EXISTS tipo_via text,
ADD COLUMN IF NOT EXISTS nombre_via text,
ADD COLUMN IF NOT EXISTS numero_via text,
ADD COLUMN IF NOT EXISTS piso text,
ADD COLUMN IF NOT EXISTS puerta text,
ADD COLUMN IF NOT EXISTS poblacion text,
ADD COLUMN IF NOT EXISTS codigo_postal text,
ADD COLUMN IF NOT EXISTS provincia text,
ADD COLUMN IF NOT EXISTS convenio_referencia text,
ADD COLUMN IF NOT EXISTS cnae text,
ADD COLUMN IF NOT EXISTS ccc text,
ADD COLUMN IF NOT EXISTS num_medio_empleados text,
ADD COLUMN IF NOT EXISTS prefijo_telefono text,
ADD COLUMN IF NOT EXISTS representante_empresa text,
ADD COLUMN IF NOT EXISTS representante_nombre text,
ADD COLUMN IF NOT EXISTS representante_apellido1 text,
ADD COLUMN IF NOT EXISTS representante_apellido2 text,
ADD COLUMN IF NOT EXISTS nif_nie_representante text;

-- Asegurarte de que RLS permite a la API y/o Webhook hacer updates del lead.
-- (Las políticas existentes "fundae_update" y el uso de la clave "service_role" en n8n ya deberían cubrirlo).
