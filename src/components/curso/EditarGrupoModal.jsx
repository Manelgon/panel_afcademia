import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layers, Loader2, X, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';

// Edición ligera de un grupo. Solo expone los campos más editables día a día.
// Para configurar criterios completos / comunicación / profesor, recomendar evolCampus.
export default function EditarGrupoModal({ group, onClose, onSaved, showNotification }) {
    const { withLoading } = useGlobalLoading();
    const [saving, setSaving] = useState(false);
    const isAsync = group?.type !== 'SYNCRONOUS';

    const [form, setForm] = useState({
        name: '',
        days_duration: '',
        start_date: '',
        end_date: '',
        class_hours: '',
        // Coordinador (opcional)
        coord_email: '',
        coord_name: '',
        coord_surname: '',
    });

    useEffect(() => {
        if (!group) return;
        setForm({
            name: group.name || '',
            days_duration: isAsync ? (group.duration ?? '') : '',
            start_date: !isAsync ? (group.startdate || '') : '',
            end_date: !isAsync ? (group.enddate || '') : '',
            class_hours: '',
            coord_email: '',
            coord_name: '',
            coord_surname: '',
        });
    }, [group?.id]);

    const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            showNotification('El nombre del grupo es obligatorio.', 'error');
            return;
        }
        if (isAsync && form.days_duration && Number(form.days_duration) <= 0) {
            showNotification('Días de duración debe ser mayor que 0.', 'error');
            return;
        }
        if (!isAsync && form.start_date && form.end_date && form.start_date > form.end_date) {
            showNotification('La fecha de inicio no puede ser posterior a la fecha de fin.', 'error');
            return;
        }
        // Coordinador: o los 3 o ninguno
        const hasCoord = form.coord_email || form.coord_name || form.coord_surname;
        if (hasCoord && !(form.coord_email && form.coord_name && form.coord_surname)) {
            showNotification('Para asignar coordinador rellena email, nombre y apellido.', 'error');
            return;
        }

        const payload = {
            groupid: Number(group.id),
            name: form.name.trim(),
            ...(isAsync && form.days_duration ? { days_duration: Number(form.days_duration) } : {}),
            ...(!isAsync && form.start_date ? { start_date: form.start_date } : {}),
            ...(!isAsync && form.end_date ? { end_date: form.end_date } : {}),
            ...(form.class_hours ? { class_hours: Number(form.class_hours) } : {}),
            ...(hasCoord ? {
                coordinator: {
                    email: form.coord_email,
                    name: form.coord_name,
                    surname: form.coord_surname,
                }
            } : {}),
        };

        setSaving(true);
        let success = false;
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-update-group', {
                    body: payload
                });
                if (error) {
                    let detail = error.message || 'Error desconocido';
                    if (error.context && typeof error.context.json === 'function') {
                        try { const body = await error.context.json(); detail = body?.detail || body?.error || detail; } catch (_) {}
                    }
                    showNotification('Error: ' + detail, 'error');
                    return;
                }
                if (data?.error) {
                    showNotification('Error: ' + (data.detail || data.error), 'error');
                    return;
                }
                showNotification('✅ Grupo actualizado en evolCampus.');
                success = true;
            } catch (err) {
                showNotification('Error: ' + (err.message || ''), 'error');
            }
        }, 'Actualizando grupo...');
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
                className="relative w-full max-w-2xl glass rounded-[2rem] p-8 shadow-2xl my-auto"
            >
                <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                        <Layers size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-variable-main">Editar grupo</h3>
                        <p className="text-xs text-variable-muted">{group?.name} · {isAsync ? 'Asíncrono' : 'Síncrono'}</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <Field label="Nombre *" value={form.name} onChange={v => setField('name', v)} />

                    {isAsync ? (
                        <Field label="Días de duración" type="number" min="1" value={form.days_duration} onChange={v => setField('days_duration', v)} hint="Para grupos asíncronos" />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Fecha inicio" type="date" value={form.start_date} onChange={v => setField('start_date', v)} />
                            <Field label="Fecha fin" type="date" value={form.end_date} onChange={v => setField('end_date', v)} />
                        </div>
                    )}

                    <Field label="Horas de curso" type="number" value={form.class_hours} onChange={v => setField('class_hours', v)} hint="Opcional. Si no quieres cambiarlo déjalo vacío." />

                    <details className="rounded-2xl border border-variable bg-white/5">
                        <summary className="cursor-pointer list-none px-4 py-3 text-[10px] font-black text-variable-muted uppercase tracking-widest hover:bg-white/5">
                            Coordinador (opcional)
                        </summary>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-variable">
                            <Field label="Email" type="email" value={form.coord_email} onChange={v => setField('coord_email', v)} />
                            <Field label="Nombre" value={form.coord_name} onChange={v => setField('coord_name', v)} />
                            <Field label="Apellido" value={form.coord_surname} onChange={v => setField('coord_surname', v)} />
                        </div>
                    </details>

                    <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 p-4 text-xs text-amber-300/80">
                        Para configurar criterios de superación, comunicación o asignar profesor, edita el grupo directamente en evolCampus.
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-variable">
                        <button type="button" onClick={onClose} disabled={saving}
                            className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">
                            Cancelar
                        </button>
                        <div className="flex-1" />
                        <button type="button" onClick={handleSubmit} disabled={saving || !form.name.trim()}
                            className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                            {saving ? <><Loader2 className="animate-spin" size={18} /> Guardando...</> : <><Save size={18} /> Guardar cambios</>}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
        </Portal>
    );
}

function Field({ label, value, onChange, type = 'text', min, hint }) {
    return (
        <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">{label}</span>
            <input
                type={type} min={min} value={value || ''} onChange={e => onChange(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-variable rounded-2xl text-variable-main focus:border-primary/50 focus:outline-none transition-all text-sm"
            />
            {hint && <p className="text-[10px] text-variable-muted mt-1.5">{hint}</p>}
        </label>
    );
}
