import { supabase } from './supabase';

const pick = (...vals) => {
    for (const v of vals) {
        if (v === null || v === undefined) continue;
        const s = typeof v === 'string' ? v.trim() : v;
        if (s !== '' && s !== null && s !== undefined) return s;
    }
    return null;
};

// Construye payload para fundae_seguimiento.
// Acepta tanto cliente_id (preferido) como lead_id (compat).
export async function buildFundaeSeguimientoPayload(idOrOpts) {
    const opts = typeof idOrOpts === 'object' && idOrOpts !== null
        ? idOrOpts
        : { lead_id: idOrOpts };

    let cliente = null;
    let lead = null;

    if (opts.cliente_id) {
        const { data } = await supabase
            .from('clientes')
            .select('*, leads(*)')
            .eq('id', opts.cliente_id)
            .maybeSingle();
        cliente = data;
        lead = data?.leads || null;
    } else if (opts.lead_id) {
        const [{ data: leadData }, { data: cliData }] = await Promise.all([
            supabase.from('leads').select('*').eq('id', opts.lead_id).maybeSingle(),
            supabase.from('clientes').select('*').eq('lead_id', opts.lead_id).maybeSingle()
        ]);
        lead = leadData;
        cliente = cliData;
    }

    const c = cliente || {};
    const l = lead || {};

    return {
        cliente_id: c.id || null,
        lead_id: l.id || opts.lead_id || null,
        empresa: pick(l.empresa_nombre, l.nombre),
        razon_social: pick(c.razon_social, l.razon_social),
        cif: pick(c.cif, l.cif, l.cif_nif),
        email: pick(l.email),
        telefono: pick(c.telefono_empresa, l.whatsapp, l.telefono_empresa),
        domicilio: pick(c.domicilio, l.direccion, l.domicilio),
        poblacion: pick(c.poblacion, l.ciudad),
        codigo_postal: pick(c.codigo_postal, l.codigo_postal),
        provincia: pick(c.provincia, l.provincia),
        cnae: pick(c.cnae, l.cnae),
        ccc: pick(c.ccc, l.ccc),
        num_medio_empleados: pick(c.num_medio_empleados, l.num_medio_empleados),
        convenio_referencia: pick(c.convenio_referencia, l.convenio_referencia),
        representante_empresa: pick(c.representante_empresa, l.representante_empresa),
        nif_nie_representante: pick(c.nif_nie_representante, l.nif_nie_representante),
        estado: 'pendiente',
        formulario_pendiente_enviar: true,
        formulario_enviado: false,
        formulario_recibido: false,
        creditos_verificados: false,
        factura_enviada: false,
        factura_pagada: false
    };
}
