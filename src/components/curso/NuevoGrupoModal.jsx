import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';
import CustomSelect from '../CustomSelect';

export default function NuevoGrupoModal({ course, onClose, onSaved, showNotification }) {
    const { withLoading } = useGlobalLoading();
    const [saving, setSaving] = useState(false);

    // Estado del formulario
    const [form, setForm] = useState({
        // Básico
        name: '',
        type: 'A',          // A=async, S=sync
        days_duration: 30,
        start_date: '',
        end_date: '',
        // Configuración general
        class_hours: '',
        sequential: 0,
        hide_remaining_time: false,
        access_after_finish: 1,  // 0|1|2
        rating: 1,               // 0=manual, 1=automática
        min_grade: '',
        min_off: '',
        // Criterios
        criteria_min_grade: '',
        criteria_percent_total: '',
        criteria_videoconference_hours: '',
        criteria_percent_videoconference_hours: '',
        criteria_percent_hours_conected: '',
        criteria_percent_assesables: '',
        // Comunicación
        msg_teacher: false,
        msg_learners: false,
        forums: false,
        open_new_forums: false,
        chat: false,
        // Coordinador
        coord_email: '',
        coord_name: '',
        coord_surname: '',
        // Profesor
        teacher_email: '',
        teacher_name: '',
        teacher_surname: '',
    });

    const [open, setOpen] = useState({
        general: false,
        criterios: false,
        comunicacion: false,
        coordinador: false,
        profesor: false,
    });

    const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            showNotification('El nombre del grupo es obligatorio.', 'error');
            return;
        }
        if (form.type === 'A' && (!form.days_duration || Number(form.days_duration) <= 0)) {
            showNotification('Para grupos asíncronos, indica los días de duración.', 'error');
            return;
        }
        if (form.type === 'S' && (!form.start_date || !form.end_date)) {
            showNotification('Para grupos síncronos, indica fechas de inicio y fin.', 'error');
            return;
        }
        // Coordinador: o los 3 campos o ninguno
        const hasCoord = form.coord_email || form.coord_name || form.coord_surname;
        if (hasCoord && !(form.coord_email && form.coord_name && form.coord_surname)) {
            showNotification('Para asignar coordinador rellena email, nombre y apellido.', 'error');
            return;
        }
        // Profesor: o los 3 o ninguno
        const hasTeacher = form.teacher_email || form.teacher_name || form.teacher_surname;
        if (hasTeacher && !(form.teacher_email && form.teacher_name && form.teacher_surname)) {
            showNotification('Para asignar profesor rellena email, nombre y apellido.', 'error');
            return;
        }

        const payload = {
            courseid: Number(course.courseid),
            name: form.name.trim(),
            type: form.type,
            ...(form.type === 'A' ? { days_duration: Number(form.days_duration) } : {
                start_date: form.start_date,
                end_date: form.end_date
            }),
            class_hours: form.class_hours ? Number(form.class_hours) : null,
            hide_remaining_time: !!form.hide_remaining_time,
            sequential: Number(form.sequential),
            access_after_finish: Number(form.access_after_finish),
            rating: Number(form.rating),
            min_grade: form.min_grade ? Number(form.min_grade) : null,
            min_off: form.min_off ? Number(form.min_off) : null,
            criteria: {
                min_grade: form.criteria_min_grade ? Number(form.criteria_min_grade) : null,
                percent_total: form.criteria_percent_total ? Number(form.criteria_percent_total) : null,
                videoconference_hours: form.criteria_videoconference_hours ? Number(form.criteria_videoconference_hours) : null,
                percent_videoconference_hours: form.criteria_percent_videoconference_hours ? Number(form.criteria_percent_videoconference_hours) : null,
                percent_hours_conected: form.criteria_percent_hours_conected ? Number(form.criteria_percent_hours_conected) : null,
                percent_assesables: form.criteria_percent_assesables ? Number(form.criteria_percent_assesables) : null,
            },
            communication: {
                msg_teacher: !!form.msg_teacher,
                msg_learners: !!form.msg_learners,
                forums: !!form.forums,
                open_new_forums: !!form.open_new_forums,
                chat: !!form.chat,
            },
            coordinator: hasCoord ? { email: form.coord_email.trim(), name: form.coord_name.trim(), surname: form.coord_surname.trim() } : {},
            teacher: hasTeacher ? { email: form.teacher_email.trim(), name: form.teacher_name.trim(), surname: form.teacher_surname.trim() } : {},
        };

        setSaving(true);
        let success = false;
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-create-group', { body: payload });
                if (error) {
                    let detail = error.message;
                    if (error.context?.json) try { const b = await error.context.json(); detail = b?.detail || detail; } catch (_) {}
                    showNotification('Error: ' + detail, 'error');
                    return;
                }
                if (data?.error) {
                    showNotification('Error: ' + (data.detail || data.error), 'error');
                    return;
                }
                showNotification(`✅ Grupo creado (id ${data?.groupid}).`);
                success = true;
            } catch (err) {
                showNotification('Error: ' + (err.message || ''), 'error');
            }
        }, 'Creando grupo en evolCampus...');
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
                className="relative w-full max-w-3xl glass rounded-[2rem] p-8 shadow-2xl my-auto max-h-[90vh] overflow-y-auto"
            >
                <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                        <Layers size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-variable-main">Nuevo grupo</h3>
                        <p className="text-xs text-variable-muted">Curso: {course.course_name}</p>
                    </div>
                </div>

                <div className="space-y-5">
                    {/* Datos básicos */}
                    <div className="space-y-4">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2">
                            Datos básicos
                        </p>
                        <Field label="Nombre del grupo *" value={form.name} onChange={v => setField('name', v)} placeholder="Ej: Grupo Mayo 2026" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Tipo *</span>
                                <CustomSelect
                                    value={form.type}
                                    onChange={(v) => setField('type', v)}
                                    options={[
                                        { value: 'A', label: 'Asíncrono' },
                                        { value: 'S', label: 'Síncrono' }
                                    ]}
                                />
                            </label>
                            {form.type === 'A' ? (
                                <Field label="Días de duración *" type="number" value={form.days_duration} onChange={v => setField('days_duration', v)} />
                            ) : (
                                <Field label="" value="" />
                            )}
                        </div>
                        {form.type === 'S' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Fecha inicio *" type="date" value={form.start_date} onChange={v => setField('start_date', v)} />
                                <Field label="Fecha fin *" type="date" value={form.end_date} onChange={v => setField('end_date', v)} />
                            </div>
                        )}
                    </div>

                    {/* Configuración general */}
                    <Section title="Configuración general" open={open.general} onToggle={() => toggle('general')}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Horas de curso" type="number" value={form.class_hours} onChange={v => setField('class_hours', v)} />
                            <Field label="Minutos inactividad antes de aviso" type="number" value={form.min_off} onChange={v => setField('min_off', v)} />
                            <Field label="Nota mínima global" type="number" step="0.01" value={form.min_grade} onChange={v => setField('min_grade', v)} />
                            <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Acceso secuencial</span>
                                <CustomSelect
                                    value={String(form.sequential)}
                                    onChange={(v) => setField('sequential', Number(v))}
                                    options={[{ value: '0', label: 'No secuencial' }, { value: '1', label: 'Secuencial' }]}
                                />
                            </label>
                            <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Acceso tras finalizar</span>
                                <CustomSelect
                                    value={String(form.access_after_finish)}
                                    onChange={(v) => setField('access_after_finish', Number(v))}
                                    options={[
                                        { value: '0', label: 'Sin acceso' },
                                        { value: '1', label: 'Acceso completo' },
                                        { value: '2', label: 'Solo lectura' }
                                    ]}
                                />
                            </label>
                            <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Sistema calificación</span>
                                <CustomSelect
                                    value={String(form.rating)}
                                    onChange={(v) => setField('rating', Number(v))}
                                    options={[{ value: '1', label: 'Automática' }, { value: '0', label: 'Manual' }]}
                                />
                            </label>
                        </div>
                        <Toggle label="Ocultar tiempo restante al alumno" checked={form.hide_remaining_time} onChange={v => setField('hide_remaining_time', v)} />
                    </Section>

                    {/* Criterios de superación */}
                    <Section title="Criterios de superación" open={open.criterios} onToggle={() => toggle('criterios')}>
                        <p className="text-[10px] text-variable-muted">Deja en blanco lo que no apliques. Todos son opcionales.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Nota mínima" type="number" step="0.01" value={form.criteria_min_grade} onChange={v => setField('criteria_min_grade', v)} />
                            <Field label="% actividades finalizadas" type="number" value={form.criteria_percent_total} onChange={v => setField('criteria_percent_total', v)} />
                            <Field label="Horas videoconferencia" type="number" value={form.criteria_videoconference_hours} onChange={v => setField('criteria_videoconference_hours', v)} />
                            <Field label="% horas videoconferencia" type="number" value={form.criteria_percent_videoconference_hours} onChange={v => setField('criteria_percent_videoconference_hours', v)} />
                            <Field label="% horas conectado" type="number" value={form.criteria_percent_hours_conected} onChange={v => setField('criteria_percent_hours_conected', v)} />
                            <Field label="% actividades evaluables" type="number" value={form.criteria_percent_assesables} onChange={v => setField('criteria_percent_assesables', v)} />
                        </div>
                    </Section>

                    {/* Comunicación */}
                    <Section title="Comunicación" open={open.comunicacion} onToggle={() => toggle('comunicacion')}>
                        <Toggle label="Mensajería con profesor" checked={form.msg_teacher} onChange={v => setField('msg_teacher', v)} />
                        <Toggle label="Mensajería entre alumnos" checked={form.msg_learners} onChange={v => setField('msg_learners', v)} />
                        <Toggle label="Foros activados" checked={form.forums} onChange={v => setField('forums', v)} />
                        <Toggle label="Alumnos pueden crear foros" checked={form.open_new_forums} onChange={v => setField('open_new_forums', v)} />
                        <Toggle label="Chat online" checked={form.chat} onChange={v => setField('chat', v)} />
                    </Section>

                    {/* Coordinador */}
                    <Section title="Coordinador (opcional)" open={open.coordinador} onToggle={() => toggle('coordinador')}>
                        <p className="text-[10px] text-variable-muted">Si rellenas alguno, los 3 son obligatorios.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Field label="Email" type="email" value={form.coord_email} onChange={v => setField('coord_email', v)} />
                            <Field label="Nombre" value={form.coord_name} onChange={v => setField('coord_name', v)} />
                            <Field label="Apellido" value={form.coord_surname} onChange={v => setField('coord_surname', v)} />
                        </div>
                    </Section>

                    {/* Profesor */}
                    <Section title="Profesor (opcional)" open={open.profesor} onToggle={() => toggle('profesor')}>
                        <p className="text-[10px] text-variable-muted">Si rellenas alguno, los 3 son obligatorios.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Field label="Email" type="email" value={form.teacher_email} onChange={v => setField('teacher_email', v)} />
                            <Field label="Nombre" value={form.teacher_name} onChange={v => setField('teacher_name', v)} />
                            <Field label="Apellido" value={form.teacher_surname} onChange={v => setField('teacher_surname', v)} />
                        </div>
                    </Section>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button type="button" onClick={onClose} disabled={saving}
                            className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">
                            Cancelar
                        </button>
                        <div className="flex-1" />
                        <button type="button" onClick={handleSubmit} disabled={saving}
                            className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50">
                            {saving ? <><Loader2 className="animate-spin" size={18} /> Creando...</> : <><Layers size={18} /> Crear grupo</>}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
        </Portal>
    );
}

function Section({ title, open, onToggle, children }) {
    return (
        <div className="border border-variable rounded-2xl overflow-hidden">
            <button type="button" onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{title}</span>
                {open ? <ChevronDown size={16} className="text-primary" /> : <ChevronRight size={16} className="text-variable-muted" />}
            </button>
            {open && (
                <div className="p-4 space-y-3">
                    {children}
                </div>
            )}
        </div>
    );
}

function Field({ label, value, onChange, type = 'text', step, placeholder }) {
    if (label === '') return <div />; // hueco
    return (
        <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">{label}</span>
            <input type={type} step={step} value={value ?? ''} placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-variable rounded-2xl text-variable-main focus:border-primary/50 focus:outline-none transition-all text-sm" />
        </label>
    );
}

function Toggle({ label, checked, onChange }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer text-sm text-variable-main py-1">
            <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
            {label}
        </label>
    );
}
