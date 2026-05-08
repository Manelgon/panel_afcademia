import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Loader2, X, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';
import CustomSelect from '../CustomSelect';

export default function NuevaMatriculaModal({ alumno, onClose, onSaved, showNotification }) {
    const { withLoading } = useGlobalLoading();

    const [loadingCatalogo, setLoadingCatalogo] = useState(true);
    const [saving, setSaving] = useState(false);
    const [courses, setCourses] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [empresasEvol, setEmpresasEvol] = useState([]); // empresas FUNDAE de evolCampus

    const todayStr = new Date().toISOString().slice(0, 10);

    const [form, setForm] = useState({
        courseid: '',
        groupid: '',
        cliente_id: '',
        companyid: '', // empresa FUNDAE en evolCampus (opcional)
        fecha_inicio: todayStr,
    });

    useEffect(() => {
        const load = async () => {
            try {
                const [coursesRes, clientesRes, alumnoClientesRes, empresasEvolRes] = await Promise.all([
                    supabase.functions.invoke('evolcampus-list-courses', { body: {} }),
                    supabase.from('clientes').select('id, razon_social, leads(empresa_nombre)').order('razon_social'),
                    // Clientes ya vinculados al alumno (vía matrículas o vía fichas FUNDAE)
                    alumno?.id ? supabase
                        .from('alumnos')
                        .select(`
                            matriculas(cliente_id),
                            fundae_alumnos(fundae_seguimiento(cliente_id))
                        `)
                        .eq('id', alumno.id)
                        .maybeSingle() : Promise.resolve({ data: null }),
                    supabase.functions.invoke('evolcampus-proxy', {
                        body: { action: 'getCompaniesClient', method: 'POST', params: {} }
                    })
                ]);
                if (coursesRes.error) {
                    showNotification('Error cargando cursos: ' + coursesRes.error.message, 'error');
                } else {
                    setCourses(coursesRes.data?.courses || []);
                }
                if (!clientesRes.error) {
                    setClientes(clientesRes.data || []);
                }
                if (!empresasEvolRes.error) {
                    const empresas = empresasEvolRes.data?.empresas || [];
                    setEmpresasEvol(Array.isArray(empresas) ? empresas : []);
                }

                // Pre-seleccionar cliente: si el alumno está vinculado a uno solo, lo elegimos por defecto.
                const ids = new Set();
                for (const m of alumnoClientesRes?.data?.matriculas || []) {
                    if (m.cliente_id) ids.add(Number(m.cliente_id));
                }
                for (const f of alumnoClientesRes?.data?.fundae_alumnos || []) {
                    const cid = f.fundae_seguimiento?.cliente_id;
                    if (cid) ids.add(Number(cid));
                }
                if (ids.size === 1) {
                    const onlyId = Array.from(ids)[0];
                    setForm(f => ({ ...f, cliente_id: String(onlyId) }));
                }
            } finally {
                setLoadingCatalogo(false);
            }
        };
        load();
    }, [alumno?.id]);

    const courseOptions = courses.map(c => ({
        value: String(c.courseid),
        label: c.course_name || `Curso ${c.courseid}`
    }));
    const selectedCourse = courses.find(c => String(c.courseid) === String(form.courseid));
    const groupOptions = (selectedCourse?.groups || []).map(g => ({
        value: String(g.groupid),
        label: `${g.group_name || `Grupo ${g.groupid}`}${g.type === 'SYNCRONOUS' ? ' (síncrono)' : ''}`
    }));
    const clienteOptions = [
        { value: '', label: 'Sin cliente' },
        ...clientes.map(c => ({
            value: String(c.id),
            label: c.razon_social || c.leads?.empresa_nombre || `Cliente ${c.id}`
        }))
    ];
    const empresaEvolOptions = [
        { value: '', label: 'Sin empresa FUNDAE' },
        ...empresasEvol.map(e => ({
            value: String(e.idEmpresaCliente),
            label: e.sCif ? `${e.sEmpresa} (${e.sCif})` : e.sEmpresa
        }))
    ];

    const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async () => {
        if (!form.groupid) {
            showNotification('Selecciona curso y grupo.', 'error');
            return;
        }
        const courseObj = courses.find(c => String(c.courseid) === String(form.courseid));
        const groupObj = courseObj?.groups?.find(g => String(g.groupid) === String(form.groupid));

        setSaving(true);
        let success = false;
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-create-enrollment', {
                    body: {
                        alumno_id: alumno.id,
                        groupid: Number(form.groupid),
                        courseid: form.courseid ? Number(form.courseid) : null,
                        cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
                        companyid: form.companyid ? Number(form.companyid) : null,
                        fecha_inicio: form.fecha_inicio || null,
                        curso_nombre: courseObj?.course_name || null,
                        grupo_nombre: groupObj?.group_name || null,
                    }
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
                showNotification(`✅ Matrícula creada (id ${data?.enrollmentid}). Email de bienvenida enviado.`);
                success = true;
            } catch (err) {
                showNotification('Error: ' + (err.message || ''), 'error');
            }
        }, 'Matriculando en evolCampus...');
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
                        <GraduationCap size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-variable-main">Nueva matrícula</h3>
                        <p className="text-xs text-variable-muted">{alumno?.nombre} {alumno?.apellidos} · {alumno?.email}</p>
                    </div>
                </div>

                {loadingCatalogo ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        {courseOptions.length === 0 ? (
                            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-amber-400">
                                No hay cursos activos disponibles en evolCampus.
                            </div>
                        ) : (
                            <>
                                <label className="block">
                                    <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Curso *</span>
                                    <CustomSelect
                                        value={form.courseid}
                                        onChange={(v) => { setField('courseid', v); setField('groupid', ''); }}
                                        options={courseOptions}
                                        placeholder="Selecciona un curso..."
                                    />
                                </label>

                                <label className="block">
                                    <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Grupo *</span>
                                    <CustomSelect
                                        value={form.groupid}
                                        onChange={(v) => setField('groupid', v)}
                                        options={groupOptions}
                                        placeholder={selectedCourse ? 'Selecciona un grupo...' : 'Selecciona primero un curso'}
                                    />
                                </label>

                                <label className="block">
                                    <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Cliente (opcional)</span>
                                    <CustomSelect
                                        value={form.cliente_id}
                                        onChange={(v) => setField('cliente_id', v)}
                                        options={clienteOptions}
                                    />
                                </label>

                                {empresasEvol.length > 0 && (
                                    <label className="block">
                                        <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Empresa FUNDAE (opcional)</span>
                                        <CustomSelect
                                            value={form.companyid}
                                            onChange={(v) => setField('companyid', v)}
                                            options={empresaEvolOptions}
                                        />
                                        <p className="text-[10px] text-variable-muted mt-1.5">
                                            Empresa registrada en evolCampus. Solo necesario para formación bonificada que requiera vincular la matrícula a una empresa concreta del catálogo de FUNDAE.
                                        </p>
                                    </label>
                                )}

                                <label className="block">
                                    <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Fecha de inicio</span>
                                    <input
                                        type="date"
                                        value={form.fecha_inicio}
                                        onChange={(e) => setField('fecha_inicio', e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-variable rounded-2xl text-variable-main focus:border-primary/50 focus:outline-none transition-all text-sm"
                                    />
                                    <p className="text-[10px] text-variable-muted mt-1.5">
                                        En grupos asíncronos esta fecha programa la matrícula. En síncronos suele usarse la fecha del grupo.
                                    </p>
                                </label>

                                <div className="rounded-2xl bg-blue-500/5 border border-blue-500/20 p-4 text-xs text-blue-300/80 flex gap-2">
                                    <BookOpen size={14} className="flex-shrink-0 mt-0.5" />
                                    evolCampus enviará un email de bienvenida al alumno con sus credenciales.
                                </div>
                            </>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <button type="button" onClick={onClose} disabled={saving}
                                className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">
                                Cancelar
                            </button>
                            <div className="flex-1" />
                            <button type="button" onClick={handleSubmit} disabled={saving || !form.groupid}
                                className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                                {saving ? <><Loader2 className="animate-spin" size={18} /> Matriculando...</> : <><GraduationCap size={18} /> Matricular</>}
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
        </Portal>
    );
}
