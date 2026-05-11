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

            // Buscar alumno en evolCampus por DNI (si la ficha tiene DNI).
            // Si existe, traemos userid + matrículas; si no, seguimos sin vincular.
            let evolFound = null;
            if (dniNorm) {
                try {
                    const { data, error } = await supabase.functions.invoke('evolcampus-find-user', {
                        body: { dni: dniNorm }
                    });
                    if (error) {
                        console.warn('[evolcampus-find-user] error:', error);
                    } else if (data?.userid) {
                        evolFound = data;
                    }
                } catch (err) {
                    console.warn('[evolcampus-find-user] excepción:', err);
                }
            }

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
                // Vincular evolcampus_userid si lo encontramos y el alumno aún no lo tiene
                if (evolFound?.userid && !existing.evolcampus_userid) {
                    cleaned.evolcampus_userid = evolFound.userid;
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
                if (evolFound?.userid) insertPayload.evolcampus_userid = evolFound.userid;
                const { data: ins, error } = await supabase.from('alumnos').insert(insertPayload).select('id').single();
                if (error) throw error;
                alumnoId = ins.id;
            }

            // Marcar la ficha como convertida y vinculada al alumno.
            const fichaUpdate = {
                alumno_id: alumnoId,
                ficha_estado: 'convertida',
                convertida_at: new Date().toISOString(),
                convertida_por: user?.id ?? null
            };
            // Encontrar la matrícula de evolCampus que corresponde a esta ficha:
            // 1) Si la ficha tiene evolcampus_groupid, exigimos coincidencia por groupid.
            // 2) Si NO lo tiene y evolCampus devolvió una sola matrícula, asumimos que es esa.
            const fichaGroupid = ficha.evolcampus_groupid != null ? Number(ficha.evolcampus_groupid) : null;
            let matchEnroll = null;
            if (fichaGroupid) {
                matchEnroll = evolFound?.enrollments?.find(e => Number(e.groupid) === fichaGroupid) || null;
            } else if (evolFound?.enrollments?.length === 1) {
                matchEnroll = evolFound.enrollments[0];
            }
            if (matchEnroll) {
                fichaUpdate.evolcampus_enrollmentid = matchEnroll.enrollmentid;
                fichaUpdate.evolcampus_groupid = matchEnroll.groupid;
                fichaUpdate.evolcampus_completed_percent = matchEnroll.completedpercent;
                fichaUpdate.evolcampus_evaluations_percent = matchEnroll.evaluationscompletedpercent;
                fichaUpdate.evolcampus_grade = matchEnroll.grade;
                fichaUpdate.evolcampus_passed = !!matchEnroll.passrequierements;
                fichaUpdate.evolcampus_status = matchEnroll.enrollmentstatus;
                fichaUpdate.evolcampus_lastconnect = matchEnroll.lastconnect;
                fichaUpdate.evolcampus_time_connected = matchEnroll.timeconnected;
                fichaUpdate.evolcampus_connections = matchEnroll.connections;
                fichaUpdate.evolcampus_url_diploma = matchEnroll.urldiploma;
                fichaUpdate.evolcampus_synced_at = new Date().toISOString();
            }

            const { error: fErr } = await supabase
                .from('fundae_alumnos')
                .update(fichaUpdate)
                .eq('id', ficha.id);
            if (fErr) throw fErr;

            // Si encontramos otras matrículas (de otras fichas del mismo alumno), las persistimos también.
            if (evolFound?.enrollments?.length && alumnoId) {
                const { data: otrasFichas } = await supabase
                    .from('fundae_alumnos')
                    .select('id, evolcampus_groupid, evolcampus_enrollmentid')
                    .eq('alumno_id', alumnoId)
                    .neq('id', ficha.id);
                for (const otra of otrasFichas || []) {
                    if (!otra.evolcampus_groupid) continue;
                    const m = evolFound.enrollments.find(e => Number(e.groupid) === Number(otra.evolcampus_groupid));
                    if (!m) continue;
                    await supabase.from('fundae_alumnos').update({
                        evolcampus_enrollmentid: m.enrollmentid,
                        evolcampus_completed_percent: m.completedpercent,
                        evolcampus_evaluations_percent: m.evaluationscompletedpercent,
                        evolcampus_grade: m.grade,
                        evolcampus_passed: !!m.passrequierements,
                        evolcampus_status: m.enrollmentstatus,
                        evolcampus_lastconnect: m.lastconnect,
                        evolcampus_time_connected: m.timeconnected,
                        evolcampus_connections: m.connections,
                        evolcampus_url_diploma: m.urldiploma,
                        evolcampus_synced_at: new Date().toISOString(),
                    }).eq('id', otra.id);
                }
            }

            // Sincronizar tabla matriculas: upsert por enrollmentid de cada matrícula
            // encontrada para este alumno en evolCampus.
            if (evolFound?.enrollments?.length && alumnoId) {
                const ahora = new Date().toISOString();
                // Re-leer las fichas del alumno (incluida la actual ya con enrollmentid si match)
                const { data: fichasAlumno } = await supabase
                    .from('fundae_alumnos')
                    .select('id, fundae_id, evolcampus_groupid, fundae_seguimiento(cliente_id)')
                    .eq('alumno_id', alumnoId);
                for (const m of evolFound.enrollments) {
                    if (!m.enrollmentid) continue;
                    const fichaMatch = (fichasAlumno || []).find(f => Number(f.evolcampus_groupid) === Number(m.groupid));
                    const matriculaPayload = {
                        alumno_id: alumnoId,
                        cliente_id: fichaMatch?.fundae_seguimiento?.cliente_id || null,
                        fundae_alumno_id: fichaMatch?.id || null,
                        tipo: fichaMatch ? 'fundae' : 'manual',
                        curso_nombre: m.study,
                        grupo_nombre: m.group,
                        evolcampus_userid: evolFound.userid,
                        evolcampus_enrollmentid: m.enrollmentid,
                        evolcampus_groupid: m.groupid,
                        completedpercent: m.completedpercent,
                        evaluations_percent: m.evaluationscompletedpercent,
                        grade: m.grade,
                        passed: !!m.passrequierements,
                        enrollmentstatus: m.enrollmentstatus,
                        lastconnect: m.lastconnect,
                        timeconnected: m.timeconnected,
                        connections: m.connections,
                        url_diploma: m.urldiploma,
                        evolcampus_synced_at: ahora,
                    };
                    const { error: matErr } = await supabase
                        .from('matriculas')
                        .upsert(matriculaPayload, { onConflict: 'evolcampus_enrollmentid' });
                    if (matErr) console.warn('[matriculas upsert] error:', matErr);
                }
            }

            const baseMsg = existing ? '✅ Ficha vinculada al alumno existente.' : '✅ Alumno creado y ficha vinculada.';
            const evolMsg = evolFound?.userid
                ? ` Vinculado a evolCampus (userid ${evolFound.userid}${matchEnroll ? `, matrícula ${matchEnroll.enrollmentid}` : ''}).`
                : (dniNorm ? ' No se encontró matrícula en evolCampus para este DNI.' : '');
            showNotification(baseMsg + evolMsg);
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
