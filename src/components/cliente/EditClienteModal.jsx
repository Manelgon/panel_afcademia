import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, CreditCard, Loader2, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';

export default function EditClienteModal({ cliente, onClose, onSaved, showNotification }) {
    const { withLoading } = useGlobalLoading();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [billing, setBilling] = useState(null);

    // Lead asociado al cliente (para datos de contacto)
    const lead = cliente?.leads || null;
    const leadId = cliente?.lead_id ?? lead?.id ?? null;

    // Datos del cliente (tabla clientes + contacto desde leads)
    const [datos, setDatos] = useState({
        empresa_nombre: '',  // nombre del despacho (leads.empresa_nombre)
        razon_social: '',    // dato fiscal (clientes.razon_social)
        cif_nif: '',
        direccion: '',
        ciudad: '',
        provincia: '',
        codigo_postal: '',
        nombre: '',
        email: '',
        whatsapp: ''
    });

    // Datos de cobro (tabla lead_billing)
    const [cobro, setCobro] = useState({
        email_facturacion: '',
        metodo_pago: '',
        iban: ''
    });

    useEffect(() => {
        const load = async () => {
            try {
                const billingRaw = cliente.lead_billing ?? lead?.lead_billing ?? null;
                const lb = (Array.isArray(billingRaw) ? billingRaw[0] : billingRaw) || null;
                setBilling(lb);

                setDatos({
                    empresa_nombre: cliente.empresa_nombre || lead?.empresa_nombre || '',
                    razon_social: cliente.razon_social || lb?.razon_social || '',
                    cif_nif: cliente.cif || lb?.cif || '',
                    direccion: cliente.domicilio || lb?.direccion_facturacion || '',
                    ciudad: cliente.poblacion || lb?.poblacion || lead?.ciudad || '',
                    provincia: cliente.provincia || lb?.provincia || '',
                    codigo_postal: cliente.codigo_postal || lb?.codigo_postal || '',
                    nombre: lead?.nombre || '',
                    email: lead?.email || '',
                    whatsapp: lead?.whatsapp || ''
                });

                setCobro({
                    email_facturacion: lb?.email_facturacion || '',
                    metodo_pago: lb?.metodo_pago || '',
                    iban: lb?.iban || ''
                });
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [cliente.id]);

    const handleSave = async () => {
        if (!datos.empresa_nombre.trim()) {
            showNotification('El nombre del despacho es obligatorio.', 'error');
            return;
        }
        setSaving(true);
        let success = false;
        await withLoading(async () => {
            try {
                // 1. UPDATE en clientes (datos comerciales/fiscales — fuente de verdad)
                const clientePayload = {
                    empresa_nombre: datos.empresa_nombre || null,
                    razon_social: datos.razon_social || null,
                    cif: datos.cif_nif || null,
                    domicilio: datos.direccion || null,
                    poblacion: datos.ciudad || null,
                    provincia: datos.provincia || null,
                    codigo_postal: datos.codigo_postal || null
                };
                const { error: cliErr } = await supabase
                    .from('clientes')
                    .update(clientePayload)
                    .eq('id', cliente.id);
                if (cliErr) throw cliErr;

                // 2. UPDATE en leads SOLO datos de contacto.
                // empresa_nombre del lead queda como snapshot histórico de captación; no se sobrescribe.
                if (leadId) {
                    const leadPayload = {
                        nombre: datos.nombre || null,
                        email: datos.email || null,
                        whatsapp: datos.whatsapp || null
                    };
                    const { error: leadErr } = await supabase
                        .from('leads')
                        .update(leadPayload)
                        .eq('id', leadId);
                    if (leadErr) throw leadErr;
                }

                // 3. Upsert en lead_billing (datos de cobro)
                if (leadId) {
                    const billingPayload = {
                        lead_id: leadId,
                        razon_social: datos.razon_social,
                        cif: datos.cif_nif || null,
                        direccion_facturacion: datos.direccion || null,
                        poblacion: datos.ciudad || null,
                        provincia: datos.provincia || null,
                        codigo_postal: datos.codigo_postal || null,
                        email_facturacion: cobro.email_facturacion || null,
                        metodo_pago: cobro.metodo_pago || null,
                        iban: cobro.iban || null
                    };
                    if (billing?.id) {
                        const { error } = await supabase
                            .from('lead_billing')
                            .update(billingPayload)
                            .eq('id', billing.id);
                        if (error) throw error;
                    } else {
                        const { error } = await supabase
                            .from('lead_billing')
                            .insert(billingPayload);
                        if (error) throw error;
                    }
                }

                showNotification('✅ Cliente actualizado.');
                success = true;
            } catch (err) {
                console.error(err);
                showNotification('Error al guardar: ' + err.message, 'error');
            }
        }, 'Guardando cambios...');
        setSaving(false);
        if (success) {
            onSaved?.();
            onClose();
        }
    };

    return (
        <Portal>
        <div className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center p-4 pb-24 sm:pb-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-3xl glass rounded-[2rem] p-8 shadow-2xl my-auto"
            >
                <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-variable-main">Editar cliente</h3>
                        <p className="text-xs text-variable-muted">{datos.empresa_nombre || datos.razon_social || lead?.nombre}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Datos del Cliente */}
                        <div className="space-y-4">
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 flex items-center gap-2">
                                <Building2 size={14} /> Datos del Cliente
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Nombre del despacho *" value={datos.empresa_nombre} onChange={v => setDatos(d => ({ ...d, empresa_nombre: v }))} />
                                <Field label="Razón Social (fiscal)" value={datos.razon_social} onChange={v => setDatos(d => ({ ...d, razon_social: v }))} />
                                <Field label="CIF / NIF" value={datos.cif_nif} onChange={v => setDatos(d => ({ ...d, cif_nif: v.toUpperCase() }))} />
                                <Field label="Dirección" value={datos.direccion} onChange={v => setDatos(d => ({ ...d, direccion: v }))} className="md:col-span-2" />
                                <Field label="Ciudad" value={datos.ciudad} onChange={v => setDatos(d => ({ ...d, ciudad: v }))} />
                                <Field label="Provincia" value={datos.provincia} onChange={v => setDatos(d => ({ ...d, provincia: v }))} />
                                <Field label="Código Postal" value={datos.codigo_postal} onChange={v => setDatos(d => ({ ...d, codigo_postal: v }))} />
                                <Field label="Persona de contacto" value={datos.nombre} onChange={v => setDatos(d => ({ ...d, nombre: v }))} />
                                <Field label="Email" type="email" value={datos.email} onChange={v => setDatos(d => ({ ...d, email: v }))} />
                                <Field label="WhatsApp / Teléfono" value={datos.whatsapp} onChange={v => setDatos(d => ({ ...d, whatsapp: v }))} />
                            </div>
                        </div>

                        {/* Datos de Cobro */}
                        <div className="space-y-4">
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 flex items-center gap-2">
                                <CreditCard size={14} /> Datos de Cobro
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Email facturación" type="email" value={cobro.email_facturacion} onChange={v => setCobro(c => ({ ...c, email_facturacion: v }))} />
                                <Field label="Método de pago" value={cobro.metodo_pago} onChange={v => setCobro(c => ({ ...c, metodo_pago: v }))} placeholder="transferencia, domiciliación..." />
                                <Field label="IBAN" value={cobro.iban} onChange={v => setCobro(c => ({ ...c, iban: v.toUpperCase().replace(/\s+/g, '') }))} className="md:col-span-2" mono />
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <button onClick={onClose} disabled={saving}
                                className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">
                                Cancelar
                            </button>
                            <div className="flex-1" />
                            <button onClick={handleSave} disabled={saving}
                                className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                                {saving ? <><Loader2 className="animate-spin" size={18} /> Guardando...</> : <><Save size={18} /> Guardar cambios</>}
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
        </Portal>
    );
}

function Field({ label, value, onChange, type = 'text', className = '', mono = false, placeholder }) {
    return (
        <label className={`block ${className}`}>
            <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">{label}</span>
            <input
                type={type}
                value={value || ''}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                className={`w-full px-4 py-3 bg-white/5 border border-variable rounded-2xl text-variable-main focus:border-primary/50 focus:outline-none transition-all text-sm ${mono ? 'font-mono' : ''}`}
            />
        </label>
    );
}
