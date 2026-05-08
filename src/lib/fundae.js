import { supabase } from './supabase';

const pick = (...vals) => {
    for (const v of vals) {
        if (v === null || v === undefined) continue;
        const s = typeof v === 'string' ? v.trim() : v;
        if (s !== '' && s !== null && s !== undefined) return s;
    }
    return null;
};

export async function buildFundaeSeguimientoPayload(leadId) {
    const [{ data: lead }, { data: billing }] = await Promise.all([
        supabase.from('leads').select('*').eq('id', leadId).maybeSingle(),
        supabase.from('lead_billing').select('*').eq('lead_id', leadId).maybeSingle()
    ]);

    const l = lead || {};
    const b = billing || {};

    return {
        lead_id: leadId,
        empresa: pick(l.empresa_nombre, l.nombre),
        razon_social: pick(b.razon_social, l.razon_social),
        cif: pick(b.cif, l.cif, l.cif_nif),
        email: pick(l.email),
        telefono: pick(l.whatsapp, l.telefono_empresa),
        domicilio: pick(b.direccion_facturacion, l.direccion, l.domicilio),
        poblacion: pick(b.poblacion, l.ciudad),
        codigo_postal: pick(b.codigo_postal, l.codigo_postal),
        provincia: pick(b.provincia, l.provincia),
        cnae: pick(l.cnae),
        ccc: pick(l.ccc),
        num_medio_empleados: pick(l.num_medio_empleados),
        convenio_referencia: pick(l.convenio_referencia),
        representante_empresa: pick(l.representante_empresa),
        nif_nie_representante: pick(l.nif_nie_representante),
        estado: 'pendiente',
        formulario_pendiente_enviar: true,
        formulario_enviado: false,
        formulario_recibido: false,
        creditos_verificados: false,
        factura_enviada: false,
        factura_pagada: false
    };
}
