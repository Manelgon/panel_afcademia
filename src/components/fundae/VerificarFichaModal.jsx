import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, X, Save, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';
import CustomSelect from '../CustomSelect';
import { NIVELES_ESTUDIOS, CATEGORIAS_PROFESIONALES, labelToValue, valueToLabel } from './fundaeConstants';

export default function VerificarFichaModal({ ficha, onClose, onSaved, showNotification }) {
    const { withLoading } = useGlobalLoading();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        nombre: '', apellidos: '', dni: '', email: '', telefono: '',
        fecha_nacimiento: '', nivel_estudios: '', categoria_profesional: '',
        nass: '', coste_salarial_hora: '', solapa_horario: false, horas_solapadas: '',
        discapacidad_33: false
    });

    useEffect(() => {
        if (!ficha) return;
        setForm({
            nombre: ficha.nombre || '',
            apellidos: ficha.apellidos || '',
            dni: ficha.dni || '',
            email: ficha.email || '',
            telefono: ficha.telefono || '',
            fecha_nacimiento: ficha.fecha_nacimiento || '',
            nivel_estudios: labelToValue(NIVELES_ESTUDIOS, ficha.nivel_estudios),
            categoria_profesional: labelToValue(CATEGORIAS_PROFESIONALES, ficha.categoria_profesional),
            discapacidad_33: !!ficha.discapacidad_33,
            nass: ficha.nass || '',
            coste_salarial_hora: ficha.coste_salarial_hora ?? '',
            solapa_horario: !!ficha.solapa_horario,
            horas_solapadas: ficha.horas_solapadas ?? ''
        });
    }, [ficha?.id]);

    const handleDownload = async () => {
        if (!ficha?.ficha_pdf_path) {
            showNotification('Esta ficha no tiene PDF guardado.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.storage
                    .from('fundae-docs')
                    .createSignedUrl(ficha.ficha_pdf_path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank', 'noopener');
            } catch (err) {
                showNotification('No se pudo descargar el PDF: ' + err.message, 'error');
            }
        }, 'Generando enlace al PDF...');
    };

    const handleSave = async () => {
        if (!form.nombre.trim() || !form.apellidos.trim() || !form.dni.trim()) {
            showNotification('Nombre, apellidos y DNI son obligatorios.', 'error');
            return;
        }
        setSaving(true);
        let updatedFicha = null;
        await withLoading(async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const dniNorm = String(form.dni).trim().toUpperCase().replace(/\s+/g, '');
                const emailNorm = form.email ? String(form.email).trim().toLowerCase() : null;

                // Convertir value (técnico) -> label (legible) antes de guardar en BD.
                const nivelLabel = valueToLabel(NIVELES_ESTUDIOS, form.nivel_estudios) || null;
                const categoriaLabel = valueToLabel(CATEGORIAS_PROFESIONALES, form.categoria_profesional) || null;

                const { error } = await supabase
                    .from('fundae_alumnos')
                    .update({
                        nombre: form.nombre.trim(),
                        apellidos: form.apellidos.trim(),
                        dni: dniNorm,
                        email: emailNorm,
                        telefono: form.telefono || null,
                        fecha_nacimiento: form.fecha_nacimiento || null,
                        nivel_estudios: nivelLabel,
                        categoria_profesional: categoriaLabel,
                        nass: form.nass || null,
                        coste_salarial_hora: form.coste_salarial_hora === '' ? null : Number(form.coste_salarial_hora),
                        solapa_horario: !!form.solapa_horario,
                        horas_solapadas: form.solapa_horario ? Number(form.horas_solapadas || 0) : null,
                        discapacidad_33: !!form.discapacidad_33,
                        ficha_estado: 'verificada',
                        verificada_at: new Date().toISOString(),
                        verificada_por: user?.id ?? null
                    })
                    .eq('id', ficha.id);
                if (error) throw error;
                showNotification('✅ Ficha verificada.');
                updatedFicha = {
                    ...ficha,
                    nombre: form.nombre.trim(),
                    apellidos: form.apellidos.trim(),
                    dni: dniNorm,
                    email: emailNorm,
                    telefono: form.telefono || null,
                    fecha_nacimiento: form.fecha_nacimiento || null,
                    nivel_estudios: nivelLabel,
                    categoria_profesional: categoriaLabel,
                    nass: form.nass || null,
                    discapacidad_33: !!form.discapacidad_33,
                    ficha_estado: 'verificada'
                };
            } catch (err) {
                showNotification('Error: ' + err.message, 'error');
            }
        }, 'Verificando ficha...');
        setSaving(false);
        if (updatedFicha) {
            onSaved?.(updatedFicha);
            onClose();
        }
    };

    return (
        <Portal>
        <div className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center p-4 pb-24 sm:pb-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-3xl glass rounded-[2rem] p-8 shadow-2xl my-auto">
                <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                        <CheckCircle2 size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-variable-main">Verificar ficha</h3>
                        <p className="text-xs text-variable-muted">Revisa y corrige los datos antes de marcar como verificada.</p>
                    </div>
                    {ficha?.ficha_pdf_path && (
                        <button onClick={handleDownload}
                            className="px-3 py-2 glass rounded-xl text-blue-500 hover:bg-blue-500/10 text-xs font-bold flex items-center gap-2 border border-blue-500/20">
                            <Download size={14} /> Ver PDF firmado
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Nombre *" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} />
                    <Field label="Apellidos *" value={form.apellidos} onChange={v => setForm(f => ({ ...f, apellidos: v }))} />
                    <Field label="DNI *" value={form.dni} onChange={v => setForm(f => ({ ...f, dni: v.toUpperCase() }))} mono />
                    <Field label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
                    <Field label="Teléfono" value={form.telefono} onChange={v => setForm(f => ({ ...f, telefono: v }))} />
                    <Field label="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={v => setForm(f => ({ ...f, fecha_nacimiento: v }))} />
                    <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Nivel de estudios</span>
                        <CustomSelect
                            value={form.nivel_estudios}
                            onChange={v => setForm(f => ({ ...f, nivel_estudios: v }))}
                            options={NIVELES_ESTUDIOS}
                            placeholder="Selecciona nivel..."
                        />
                    </label>
                    <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Categoría profesional</span>
                        <CustomSelect
                            value={form.categoria_profesional}
                            onChange={v => setForm(f => ({ ...f, categoria_profesional: v }))}
                            options={CATEGORIAS_PROFESIONALES}
                            placeholder="Selecciona categoría..."
                        />
                    </label>
                    <Field label="NASS" value={form.nass} onChange={v => setForm(f => ({ ...f, nass: v }))} mono />
                    <Field label="Coste salarial bruto/hora (€)" type="number" step="0.01" value={form.coste_salarial_hora}
                        onChange={v => setForm(f => ({ ...f, coste_salarial_hora: v }))} />
                </div>

                <div className="mt-5 p-4 rounded-2xl bg-white/5 border border-variable">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={!!form.discapacidad_33}
                            onChange={e => setForm(f => ({ ...f, discapacidad_33: e.target.checked }))} />
                        <span className="text-sm text-variable-main">Discapacidad reconocida ≥ 33%</span>
                    </label>
                </div>

                <div className="mt-5 p-4 rounded-2xl bg-white/5 border border-variable">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={!!form.solapa_horario}
                            onChange={e => setForm(f => ({ ...f, solapa_horario: e.target.checked, horas_solapadas: e.target.checked ? f.horas_solapadas : '' }))} />
                        <span className="text-sm text-variable-main">Solapa con horario habitual de trabajo</span>
                    </label>
                    {form.solapa_horario && (
                        <div className="mt-4 max-w-xs">
                            <Field label="Horas solapadas" type="number" step="0.5" value={form.horas_solapadas}
                                onChange={v => setForm(f => ({ ...f, horas_solapadas: v }))} />
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-6 mt-2 border-t border-variable">
                    <button onClick={onClose} disabled={saving}
                        className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">
                        Cancelar
                    </button>
                    <div className="flex-1" />
                    <button onClick={handleSave} disabled={saving}
                        className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                        {saving ? <><Loader2 className="animate-spin" size={18} /> Guardando...</> : <><Save size={18} /> Guardar y verificar</>}
                    </button>
                </div>
            </motion.div>
        </div>
        </Portal>
    );
}

function Field({ label, value, onChange, type = 'text', step, mono = false }) {
    return (
        <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">{label}</span>
            <input type={type} step={step} value={value || ''} onChange={e => onChange(e.target.value)}
                className={`w-full px-4 py-3 bg-white/5 border border-variable rounded-2xl text-variable-main focus:border-primary/50 focus:outline-none transition-all text-sm ${mono ? 'font-mono' : ''}`} />
        </label>
    );
}
