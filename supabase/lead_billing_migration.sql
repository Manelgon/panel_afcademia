-- ══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Ampliación de Leads y Tabla de Facturación
-- ══════════════════════════════════════════════════════════════════════

-- 1. Ampliar tabla leads con datos de empresa
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS cif_nif       text,
ADD COLUMN IF NOT EXISTS direccion     text,
ADD COLUMN IF NOT EXISTS codigo_postal text,
ADD COLUMN IF NOT EXISTS provincia     text;

-- 2. Crear tabla de facturación relacionada con el lead
CREATE TABLE IF NOT EXISTS public.lead_billing (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                 bigint      NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    razon_social           text,
    cif                    text,
    direccion_facturacion  text,
    poblacion              text,
    provincia              text,
    codigo_postal          text,
    email_facturacion      text,
    metodo_pago            text,
    iban                   text,
    -- Progreso de facturación
    numero_factura         text,
    importe_factura        numeric     DEFAULT 0,
    estado_factura         text        DEFAULT 'pendiente'
                           CHECK (estado_factura IN ('pendiente', 'enviada', 'pagada', 'cancelada')),
    fecha_factura_enviada  timestamptz,
    fecha_factura_pagada   timestamptz,
    notas_factura          text,
    updated_at             timestamptz DEFAULT now(),
    UNIQUE(lead_id)
);

-- 3. Trigger para updated_at en lead_billing
DROP TRIGGER IF EXISTS set_updated_at_lead_billing ON public.lead_billing;
CREATE TRIGGER set_updated_at_lead_billing
    BEFORE UPDATE ON public.lead_billing
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 4. RLS (Row Level Security)
ALTER TABLE public.lead_billing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_select" ON public.lead_billing;
CREATE POLICY "billing_select" ON public.lead_billing
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "billing_insert" ON public.lead_billing;
CREATE POLICY "billing_insert" ON public.lead_billing
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "billing_update" ON public.lead_billing;
CREATE POLICY "billing_update" ON public.lead_billing
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "billing_delete" ON public.lead_billing;
CREATE POLICY "billing_delete" ON public.lead_billing
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 5. Realtime (idempotent)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_billing;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
