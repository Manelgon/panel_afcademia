import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Loader2, X, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../../assets/logo.png';

const TEXT_KEYS = [
    'emisor_name', 'emisor_address', 'emisor_city', 'emisor_cp',
    'emisor_cif', 'emisor_phone', 'emisor_iban',
    'colegiado_nombre', 'colegio_ciudad'
];

export default function FacturaModal({ record, onClose, onCreated, showNotification }) {
    const { withLoading } = useGlobalLoading();
    const [emisor, setEmisor] = useState({});
    const [billing, setBilling] = useState(null);
    const [lead, setLead] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        numero_factura: '',
        fecha_factura: new Date().toISOString().slice(0, 10),
        concepto: 'Acción formativa FUNDAE',
        base_imponible: '',
        iva_porcentaje: 21
    });

    useEffect(() => {
        const load = async () => {
            try {
                // Datos del emisor
                const { data: settings } = await supabase
                    .from('company_settings')
                    .select('setting_key, setting_value')
                    .in('setting_key', [...TEXT_KEYS, 'logo_path']);
                const emi = {};
                (settings || []).forEach(r => { emi[r.setting_key] = r.setting_value; });
                setEmisor(emi);

                // Datos del lead + billing
                if (record?.lead_id) {
                    const { data: leadRow } = await supabase
                        .from('leads')
                        .select('*, lead_billing(*)')
                        .eq('id', record.lead_id)
                        .maybeSingle();
                    setLead(leadRow);
                    const lb = Array.isArray(leadRow?.lead_billing) ? leadRow.lead_billing[0] : leadRow?.lead_billing;
                    setBilling(lb || null);

                    // Pre-rellenar
                    setForm(f => ({
                        ...f,
                        numero_factura: lb?.numero_factura || '',
                        concepto: lb?.concepto || f.concepto,
                        base_imponible: lb?.base_imponible ?? record?.facturado ?? '',
                        iva_porcentaje: lb?.iva_porcentaje ?? 21,
                        fecha_factura: lb?.fecha_factura || f.fecha_factura
                    }));
                }
            } catch (err) {
                console.error('[FacturaModal] load error:', err);
                showNotification('Error cargando datos para la factura.', 'error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [record?.id]);

    const requestNumber = async () => {
        try {
            const { data, error } = await supabase.rpc('next_invoice_number', { p_anio: new Date().getFullYear() });
            if (error) throw error;
            if (data?.numero_factura) {
                setForm(f => ({ ...f, numero_factura: data.numero_factura }));
            }
        } catch (err) {
            showNotification('No se pudo obtener el número de factura: ' + err.message, 'error');
        }
    };

    const base = parseFloat(form.base_imponible) || 0;
    const iva = parseFloat(form.iva_porcentaje) || 0;
    const cuotaIva = +(base * iva / 100).toFixed(2);
    const total = +(base + cuotaIva).toFixed(2);

    const imageToBase64 = async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result);
            r.readAsDataURL(blob);
        });
    };

    const generateInvoicePDF = async () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const margin = 15;

        // Logo del emisor (configurable) o fallback al logo del repo
        let logoB64 = null;
        try {
            const { data: logoCfg } = await supabase.storage
                .from('doc-assets')
                .getPublicUrl('company/logo.png');
            if (logoCfg?.publicUrl) {
                try { logoB64 = await imageToBase64(`${logoCfg.publicUrl}?t=${Date.now()}`); } catch (_) { }
            }
        } catch (_) { }
        if (!logoB64) {
            try { logoB64 = await imageToBase64(logo); } catch (_) { }
        }

        // Header
        if (logoB64) doc.addImage(logoB64, 'PNG', margin, 10, 22, 22);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(0, 56, 101);
        doc.text('FACTURA', pageW - margin, 18, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text(`Nº ${form.numero_factura}`, pageW - margin, 25, { align: 'right' });
        doc.text(`Fecha: ${new Date(form.fecha_factura).toLocaleDateString('es-ES')}`, pageW - margin, 31, { align: 'right' });

        // Emisor
        doc.setDrawColor(230, 90, 30);
        doc.setLineWidth(0.4);
        doc.line(margin, 38, pageW - margin, 38);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 56, 101);
        doc.text('EMISOR', margin, 45);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(10);
        const emisorLines = [
            emisor.emisor_name || '—',
            `CIF: ${emisor.emisor_cif || '—'}`,
            emisor.emisor_address || '',
            [emisor.emisor_cp, emisor.emisor_city].filter(Boolean).join(' '),
            emisor.emisor_phone ? `Tel: ${emisor.emisor_phone}` : ''
        ].filter(Boolean);
        emisorLines.forEach((l, i) => doc.text(l, margin, 51 + i * 5));

        // Cliente
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 56, 101);
        doc.text('CLIENTE', pageW / 2 + 5, 45);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(10);
        const clienteLines = [
            billing?.razon_social || record?.razon_social || record?.empresa || lead?.empresa_nombre || '—',
            `CIF: ${billing?.cif || record?.cif || lead?.cif_nif || '—'}`,
            billing?.direccion_facturacion || record?.domicilio || '',
            [billing?.codigo_postal || record?.codigo_postal, billing?.poblacion || record?.poblacion].filter(Boolean).join(' '),
            (billing?.provincia || record?.provincia) ? `${billing?.provincia || record?.provincia}` : ''
        ].filter(Boolean);
        clienteLines.forEach((l, i) => doc.text(l, pageW / 2 + 5, 51 + i * 5));

        // Tabla líneas
        autoTable(doc, {
            startY: 90,
            head: [['Concepto', 'Cantidad', 'Importe']],
            body: [[form.concepto, '1', `${base.toFixed(2)} €`]],
            theme: 'grid',
            headStyles: { fillColor: [0, 56, 101], textColor: 255, fontStyle: 'bold', fontSize: 10 },
            styles: { fontSize: 10, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 25, halign: 'center' },
                2: { cellWidth: 35, halign: 'right' }
            },
            margin: { left: margin, right: margin }
        });

        // Totales
        const finalY = doc.lastAutoTable?.finalY || 110;
        const totalsX = pageW - margin - 70;
        const totalsW = 70;

        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);

        doc.text('Base imponible:', totalsX, finalY + 10);
        doc.text(`${base.toFixed(2)} €`, totalsX + totalsW, finalY + 10, { align: 'right' });

        doc.text(`IVA (${iva}%):`, totalsX, finalY + 16);
        doc.text(`${cuotaIva.toFixed(2)} €`, totalsX + totalsW, finalY + 16, { align: 'right' });

        doc.setDrawColor(0, 56, 101);
        doc.setLineWidth(0.4);
        doc.line(totalsX, finalY + 19, totalsX + totalsW, finalY + 19);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 56, 101);
        doc.text('TOTAL:', totalsX, finalY + 26);
        doc.text(`${total.toFixed(2)} €`, totalsX + totalsW, finalY + 26, { align: 'right' });

        // Forma de pago
        if (emisor.emisor_iban) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(80, 80, 80);
            doc.text(`Forma de pago: transferencia bancaria a ${emisor.emisor_iban}`, margin, finalY + 40);
        }

        // Footer FUNDAE
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        const footerY = doc.internal.pageSize.getHeight() - 15;
        doc.text('Operación bonificable a través de FUNDAE.', pageW / 2, footerY, { align: 'center' });

        return doc.output('blob');
    };

    const handleSave = async () => {
        if (!form.numero_factura) {
            showNotification('Genera o introduce un número de factura.', 'error');
            return;
        }
        if (base <= 0) {
            showNotification('La base imponible debe ser mayor que 0.', 'error');
            return;
        }
        if (!record?.lead_id) {
            showNotification('Este expediente no tiene un lead vinculado, no se puede crear la factura.', 'error');
            return;
        }

        setSaving(true);
        let success = null;
        await withLoading(async () => {
        try {
            const blob = await generateInvoicePDF();
            const safeNum = String(form.numero_factura).replace(/[^0-9A-Za-z_-]/g, '_');
            const path = `${record.lead_id}/${safeNum}.pdf`;

            const { error: upErr } = await supabase.storage
                .from('facturas')
                .upload(path, blob, { contentType: 'application/pdf', upsert: true });
            if (upErr) throw upErr;

            // Upsert en lead_billing (ya existe la fila por UNIQUE lead_id si la creaste)
            const billingPayload = {
                lead_id: record.lead_id,
                numero_factura: form.numero_factura,
                fecha_factura: form.fecha_factura,
                concepto: form.concepto,
                base_imponible: base,
                iva_porcentaje: iva,
                importe_factura: total,
                factura_pdf_path: path,
                factura_creada_at: new Date().toISOString()
            };

            if (billing?.id) {
                const { error: updErr } = await supabase
                    .from('lead_billing')
                    .update(billingPayload)
                    .eq('id', billing.id);
                if (updErr) throw updErr;
            } else {
                const { error: insErr } = await supabase
                    .from('lead_billing')
                    .insert(billingPayload);
                if (insErr) throw insErr;
            }

            // Marcar paso del flujo
            await supabase
                .from('fundae_seguimiento')
                .update({ factura_creada: true })
                .eq('id', record.id);

            showNotification('✅ Factura creada y guardada.');
            success = { path, total };
        } catch (err) {
            console.error(err);
            showNotification('Error creando la factura: ' + err.message, 'error');
        }
        }, 'Generando factura PDF...');
        setSaving(false);
        if (success) {
            onCreated?.(success);
            onClose();
        }
    };

    const handleDownload = async () => {
        await withLoading(async () => {
            try {
                const blob = await generateInvoicePDF();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Factura_${form.numero_factura || 'borrador'}.pdf`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 0);
            } catch (err) {
                showNotification('No se pudo generar el PDF: ' + err.message, 'error');
            }
        }, 'Generando vista previa...');
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
                className="relative w-full max-w-2xl glass rounded-[2rem] p-8 shadow-2xl my-auto"
            >
                <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-variable-main">Crear factura</h3>
                        <p className="text-xs text-variable-muted">{record?.empresa || record?.razon_social}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Nº factura *">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={form.numero_factura}
                                        onChange={e => setForm(f => ({ ...f, numero_factura: e.target.value }))}
                                        placeholder="2026/0001"
                                        className="flex-1 bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 text-sm"
                                    />
                                    <button type="button" onClick={requestNumber}
                                        className="px-3 py-3 bg-primary/10 text-primary border border-primary/30 rounded-2xl text-xs font-bold hover:bg-primary/20 transition-all whitespace-nowrap">
                                        Auto
                                    </button>
                                </div>
                            </Field>
                            <Field label="Fecha *">
                                <input type="date" value={form.fecha_factura}
                                    onChange={e => setForm(f => ({ ...f, fecha_factura: e.target.value }))}
                                    className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                            </Field>
                        </div>

                        <Field label="Concepto *">
                            <input type="text" value={form.concepto}
                                onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                                className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Base imponible (€) *">
                                <input type="number" step="0.01" value={form.base_imponible}
                                    onChange={e => setForm(f => ({ ...f, base_imponible: e.target.value }))}
                                    className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                            </Field>
                            <Field label="IVA (%) *">
                                <input type="number" step="0.01" value={form.iva_porcentaje}
                                    onChange={e => setForm(f => ({ ...f, iva_porcentaje: e.target.value }))}
                                    className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                            </Field>
                        </div>

                        <div className="rounded-2xl bg-white/5 border border-variable p-4 space-y-2">
                            <Row label="Base imponible" value={`${base.toFixed(2)} €`} />
                            <Row label={`IVA (${iva}%)`} value={`${cuotaIva.toFixed(2)} €`} />
                            <div className="border-t border-variable pt-2">
                                <Row label="TOTAL" value={`${total.toFixed(2)} €`} bold />
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <button onClick={handleDownload} disabled={saving}
                                className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all disabled:opacity-50">
                                Vista previa PDF
                            </button>
                            <div className="flex-1" />
                            <button onClick={onClose} disabled={saving}
                                className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">
                                Cancelar
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                                {saving ? <><Loader2 className="animate-spin" size={18} /> Guardando...</> : <><Save size={18} /> Crear y guardar</>}
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
        </Portal>
    );
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="block text-xs font-bold text-variable-muted uppercase tracking-widest ml-1 mb-1.5">{label}</span>
            {children}
        </label>
    );
}

function Row({ label, value, bold }) {
    return (
        <div className={`flex justify-between text-sm ${bold ? 'font-black text-primary text-base' : 'text-variable-main'}`}>
            <span>{label}</span>
            <span>{value}</span>
        </div>
    );
}
