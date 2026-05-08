import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';

const FIELDS = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'apellidos', label: 'Apellidos' },
    { key: 'dni', label: 'DNI', mono: true },
    { key: 'email', label: 'Email' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'fecha_nacimiento', label: 'Fecha nacimiento' },
    { key: 'nivel_estudios', label: 'Nivel estudios' },
    { key: 'categoria_profesional', label: 'Categoría profesional' },
    { key: 'nass', label: 'NASS', mono: true },
    { key: 'discapacidad_33', label: 'Discapacidad ≥ 33%', bool: true }
];

export default function ConvertirAlumnoModal({ ficha, onClose, onSaved, showNotification }) {
    const { withLoading } = useGlobalLoading();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [existing, setExisting] = useState(null); // alumno encontrado por DNI/email
    const [matchReason, setMatchReason] = useState(null); // 'dni' | 'email'
    const [choice, setChoice] = useState({}); // { campo: 'ficha' | 'existing' }

    useEffect(() => {
        if (!ficha) return;
        const search = async () => {
            setLoading(true);
            try {
                const dniNorm = String(ficha.dni || '').trim().toUpperCase().replace(/\s+/g, '');
                const emailNorm = ficha.email ? String(ficha.email).trim().toLowerCase() : null;

                let found = null;
                let reason = null;
                if (dniNorm) {
                    const { data } = await supabase.from('alumnos').select('*').eq('dni', dniNorm).maybeSingle();
                    if (data) { found = data; reason = 'dni'; }
                }
                if (!found && emailNorm) {
                    const { data } = await supabase.from('alumnos').select('*').ilike('email', emailNorm).maybeSingle();
                    if (data) { found = data; reason = 'email'; }
                }
                setExisting(found);
                setMatchReason(reason);

                // Inicializar elección por campo: por defecto, mantener el dato de la ficha (más reciente)
                if (found) {
                    const initial = {};
                    for (const f of FIELDS) initial[f.key] = 'ficha';
                    setChoice(initial);
                }
            } finally {
                setLoading(false);
            }
        };
        search();
    }, [ficha?.id]);

    const handleConvert = async () => {
        setSaving(true);
        let success = false;
        await withLoading(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const dniNorm = String(ficha.dni || '').trim().toUpperCase().replace(/\s+/g, '');
            const emailNorm = ficha.email ? String(ficha.email).trim().toLowerCase() : null;

            const fichaPayload = {
                nombre: ficha.nombre,
                apellidos: ficha.apellidos,
                dni: dniNorm,
                email: emailNorm,
                telefono: ficha.telefono,
                fecha_nacimiento: ficha.fecha_nacimiento,
                nivel_estudios: ficha.nivel_estudios,
                categoria_profesional: ficha.categoria_profesional,
                nass: ficha.nass,
                discapacidad_33: !!ficha.discapacidad_33
            };

            let alumnoId;
            if (existing) {
                // Construir payload final aplicando la elección campo a campo
                const finalPayload = {};
                for (const f of FIELDS) {
                    if (choice[f.key] === 'ficha') finalPayload[f.key] = fichaPayload[f.key];
                    else finalPayload[f.key] = existing[f.key];
                }
                // Filtrar nulls/empty para no sobrescribir con vacío.
                // Los booleans (false incluido) sí se mantienen.
                const cleaned = {};
                for (const [k, v] of Object.entries(finalPayload)) {
                    if (typeof v === 'boolean') cleaned[k] = v;
                    else if (v !== null && v !== undefined && v !== '') cleaned[k] = v;
                }
                const { error } = await supabase.from('alumnos').update(cleaned).eq('id', existing.id);
                if (error) throw error;
                alumnoId = existing.id;
            } else {
                const insertPayload = {};
                for (const [k, v] of Object.entries(fichaPayload)) {
                    if (typeof v === 'boolean') insertPayload[k] = v;
                    else if (v !== null && v !== undefined && v !== '') insertPayload[k] = v;
                }
                const { data: ins, error } = await supabase.from('alumnos').insert(insertPayload).select('id').single();
                if (error) throw error;
                alumnoId = ins.id;
            }

            const { error: fErr } = await supabase
                .from('fundae_alumnos')
                .update({
                    alumno_id: alumnoId,
                    ficha_estado: 'convertida',
                    convertida_at: new Date().toISOString(),
                    convertida_por: user?.id ?? null
                })
                .eq('id', ficha.id);
            if (fErr) throw fErr;

            showNotification(existing ? '✅ Ficha vinculada al alumno existente.' : '✅ Alumno creado y ficha vinculada.');
            success = true;
        } catch (err) {
            showNotification('Error: ' + err.message, 'error');
        }
        }, existing ? 'Vinculando al alumno existente...' : 'Creando alumno y vinculando...');
        setSaving(false);
        if (success) {
            onSaved?.();
            onClose();
        }
    };

    const isDifferent = (key) => {
        if (!existing) return false;
        const a = (ficha?.[key] ?? '') === null ? '' : String(ficha?.[key] ?? '').trim();
        const b = (existing?.[key] ?? '') === null ? '' : String(existing?.[key] ?? '').trim();
        return a !== b;
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
                        <UserPlus size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-variable-main">Convertir a alumno</h3>
                        <p className="text-xs text-variable-muted">{ficha?.nombre} {ficha?.apellidos}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
                ) : !existing ? (
                    <div className="space-y-5">
                        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex gap-3">
                            <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={20} />
                            <div>
                                <p className="text-sm font-bold text-emerald-400">Sin coincidencias</p>
                                <p className="text-xs text-variable-muted mt-1">No existe ningún alumno con este DNI ni email. Se creará uno nuevo.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {FIELDS.map(f => (
                                <div key={f.key}>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1">{f.label}</p>
                                    <p className={`text-sm text-variable-main ${f.mono ? 'font-mono' : ''}`}>{f.bool ? (ficha[f.key] ? 'Sí' : 'No') : (ficha[f.key] || '—')}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-variable">
                            <button onClick={onClose} disabled={saving}
                                className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">Cancelar</button>
                            <div className="flex-1" />
                            <button onClick={handleConvert} disabled={saving}
                                className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                                Crear alumno y vincular
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex gap-3">
                            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
                            <div>
                                <p className="text-sm font-bold text-amber-400">Coincidencia encontrada por {matchReason === 'dni' ? 'DNI' : 'email'}</p>
                                <p className="text-xs text-variable-muted mt-1">
                                    Ya existe un alumno con {matchReason === 'dni' ? 'el mismo DNI' : 'el mismo email'}. Para cada campo, elige qué valor quieres mantener en el alumno consolidado.
                                </p>
                            </div>
                        </div>

                        {/* Acciones rápidas */}
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => { const m = {}; for (const f of FIELDS) m[f.key] = 'ficha'; setChoice(m); }}
                                className="px-3 py-1.5 glass rounded-xl text-[10px] font-black uppercase tracking-widest text-variable-muted hover:text-primary transition-all">
                                ⮕ Usar todo de la ficha nueva
                            </button>
                            <button
                                onClick={() => { const m = {}; for (const f of FIELDS) m[f.key] = 'existing'; setChoice(m); }}
                                className="px-3 py-1.5 glass rounded-xl text-[10px] font-black uppercase tracking-widest text-variable-muted hover:text-primary transition-all">
                                ⬅ Mantener todo del existente
                            </button>
                        </div>

                        {/* Comparación campo a campo */}
                        <div className="rounded-2xl border border-variable overflow-hidden">
                            <div className="grid grid-cols-[1fr_1.2fr_1.2fr] bg-white/5 text-[10px] font-black uppercase tracking-widest text-variable-muted">
                                <div className="p-3">Campo</div>
                                <div className="p-3 border-l border-variable">Alumno existente</div>
                                <div className="p-3 border-l border-variable">Ficha nueva</div>
                            </div>
                            {FIELDS.map(f => {
                                const diff = isDifferent(f.key);
                                return (
                                    <div key={f.key} className={`grid grid-cols-[1fr_1.2fr_1.2fr] border-t border-variable text-sm ${diff ? 'bg-amber-500/5' : ''}`}>
                                        <div className="p-3 font-bold text-variable-muted text-xs flex items-center gap-2">
                                            {f.label}
                                            {diff && <span className="text-[8px] uppercase tracking-widest text-amber-500 font-black">Difiere</span>}
                                        </div>
                                        <label className={`p-3 border-l border-variable cursor-pointer flex items-center gap-2 ${choice[f.key] === 'existing' ? 'bg-primary/10' : 'hover:bg-white/5'}`}>
                                            <input type="radio" checked={choice[f.key] === 'existing'} onChange={() => setChoice(c => ({ ...c, [f.key]: 'existing' }))} />
                                            <span className={`${f.mono ? 'font-mono' : ''} text-variable-main truncate`}>{f.bool ? (existing[f.key] ? 'Sí' : 'No') : (existing[f.key] || '—')}</span>
                                        </label>
                                        <label className={`p-3 border-l border-variable cursor-pointer flex items-center gap-2 ${choice[f.key] === 'ficha' ? 'bg-primary/10' : 'hover:bg-white/5'}`}>
                                            <input type="radio" checked={choice[f.key] === 'ficha'} onChange={() => setChoice(c => ({ ...c, [f.key]: 'ficha' }))} />
                                            <span className={`${f.mono ? 'font-mono' : ''} text-variable-main truncate`}>{f.bool ? (ficha[f.key] ? 'Sí' : 'No') : (ficha[f.key] || '—')}</span>
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-variable">
                            <button onClick={onClose} disabled={saving}
                                className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">Cancelar</button>
                            <div className="flex-1" />
                            <button onClick={handleConvert} disabled={saving}
                                className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                                Vincular al alumno existente
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
        </Portal>
    );
}
