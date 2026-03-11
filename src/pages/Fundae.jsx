import React, { useState, useEffect } from 'react';
import {
    BookOpen,
    Plus,
    X,
    ShieldCheck,
    Clock,
    CheckCircle,
    AlertCircle,
    Loader2,
    Send,
    AlertTriangle,
    Ban,
    Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

// ── Flujo de 7 pasos del expediente FUNDAE ─────────────────────────────
const FLOW_STEPS = [
    { key: 'formulario_pendiente_enviar', label: 'Formulario pendiente de enviar', short: 'Pend. Enviar' },
    { key: 'formulario_enviado', label: 'Formulario enviado', short: 'Form. Env.' },
    { key: 'formulario_recibido', label: 'Formulario recibido', short: 'Form. Rec.' },
    { key: 'creditos_verificados', label: 'Créditos verificados', short: 'Créditos' },
    { key: 'factura_enviada', label: 'Factura enviada', short: 'Fact. Env.' },
    { key: 'factura_pagada', label: 'Factura pagada', short: 'Fact. Pag.' },
    { key: 'ficha_alumno_enviada', label: 'Ficha de alumno enviada', short: 'Ficha' },
];

const INITIAL_FORM = {
    empresa: '',
    cif: '',
    email: '',
    telefono: '',
    creditos_fundae: '',
    facturado: '',
    pagado: '',
    num_asistentes: '',
    formulario_pendiente_enviar: true,
    formulario_enviado: false,
    formulario_recibido: false,
    creditos_verificados: false,
    factura_enviada: false,
    factura_pagada: false,
    ficha_alumno_enviada: false,
    estado: 'pendiente',
    comentarios: ''
};

const ESTADO_CONFIG = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    en_curso: { label: 'En Curso', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    completado: { label: 'Completado', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    incidencia: { label: 'Incidencia', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
    cancelado: { label: 'Cancelado', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20' }
};

// Progress bar for the table showing current step
function FlowProgress({ record }) {
    const completedCount = FLOW_STEPS.filter(s => record[s.key]).length;
    const isFullyDone = completedCount === FLOW_STEPS.length;

    // Find the LAST step that is TRUE
    const lastTrueIndexFromEnd = [...FLOW_STEPS].reverse().findIndex(s => record[s.key]);
    const lastTrueIndex = lastTrueIndexFromEnd !== -1 ? (FLOW_STEPS.length - 1 - lastTrueIndexFromEnd) : 0;
    const currentStep = FLOW_STEPS[lastTrueIndex];

    // Number to display (0-indexing)
    const displayNum = isFullyDone ? 7 : lastTrueIndex;
    const pct = (displayNum / FLOW_STEPS.length) * 100;

    return (
        <div className="flex flex-col gap-2 min-w-[280px] pr-4">
            <div className="flex items-center gap-2">
                {isFullyDone ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                        ✓ Completado
                    </span>
                ) : (
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tight border transition-all whitespace-nowrap ${currentStep.key === 'formulario_pendiente_enviar'
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                        : 'bg-primary/10 text-primary border-primary/30'
                        }`}>
                        {displayNum}. {currentStep.label}
                    </span>
                )}
                <span className="text-[10px] text-variable-muted ml-auto font-black italic opacity-50 whitespace-nowrap">
                    {displayNum}/{FLOW_STEPS.length}
                </span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    className="bg-primary h-full rounded-full shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]"
                />
            </div>
        </div>
    );
}

// Toggle row in the modal
function ToggleStep({ step, index, checked, onChange, disabled, isCurrent }) {
    return (
        <div className={`flex items-center justify-between py-3 px-4 rounded-xl transition-all ${checked
            ? 'bg-emerald-500/5 border border-emerald-500/20'
            : isCurrent
                ? 'bg-primary/5 border border-primary/30 shadow-sm'
                : 'border border-transparent'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
            <div className="flex items-center gap-3">
                <span className={`size-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${checked
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : isCurrent
                        ? 'border-primary text-primary animate-pulse'
                        : 'border-white/20 text-variable-muted'
                    }`}>
                    {checked ? '✓' : index}
                </span>
                <div>
                    <span className={`text-sm font-medium block ${checked ? 'text-emerald-400 line-through' : isCurrent ? 'text-variable-main font-bold' : 'text-variable-muted'}`}>
                        {step.label}
                    </span>
                    {isCurrent && !checked && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary">● Acción pendiente</span>
                    )}
                </div>
            </div>
            <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => !disabled && onChange(e.target.checked)}
                    className="sr-only peer"
                    disabled={disabled}
                />
                <div className="w-11 h-6 bg-white/10 border border-primary/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
            </label>
        </div>
    );
}

export default function Fundae() {
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [formData, setFormData] = useState(INITIAL_FORM);
    const [filterEstado, setFilterEstado] = useState('todos');

    // Comment modal state for quick actions (Incidencia / Cancelar)
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [commentData, setCommentData] = useState({
        record: null,
        status: '', // 'incidencia', 'cancelado', 'completado'
        comment: ''
    });

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('fundae_seguimiento')
                .select('*, leads(nombre, empresa_nombre, email, whatsapp)')
                .order('fecha_inicio', { ascending: false });
            if (error) throw error;
            setRecords(data || []);
        } catch (err) {
            console.error('Error fetching FUNDAE:', err);
        } finally {
            setLoading(false);
        }
    };

    // ── Enviar formulario FUNDAE al lead vía webhook ──────────────────────
    const handleSendFormulario = async (record) => {
        const webhookUrl = import.meta.env.VITE_WEBHOOK_FORMULARIO_FUNDAE_URL;
        if (!webhookUrl) {
            showNotification('Webhook FUNDAE no configurado en .env (VITE_WEBHOOK_FORMULARIO_FUNDAE_URL)', 'error');
            return;
        }

        await withLoading(async () => {
            try {
                const payload = {
                    action: 'send_form',
                    fundae_id: record.id,
                    lead_id: record.lead_id,
                    empresa: record.empresa,
                    cif: record.cif,
                    email: record.email || record.leads?.email,
                    telefono: record.telefono || record.leads?.whatsapp,
                    creditos_fundae: record.creditos_fundae,
                    num_asistentes: record.num_asistentes,
                    fecha_inicio: record.fecha_inicio,
                };

                const res = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error(`Webhook respondió con ${res.status}`);

                showNotification(`✅ Solicitud de envío de formulario para ${record.empresa} procesada`);
                fetchRecords();
            } catch (err) {
                showNotification(`Error al enviar formulario: ${err.message}`, 'error');
            }
        }, `Enviando formulario a ${record.empresa}...`);
    };

    // ── Avanzar paso secuencialmente ────────────────────────────────────────
    const handleStatusChangeRequest = async (record, newStatus) => {
        // Validation: Cannot complete if steps are missing OR credits don't match invoice
        if (newStatus === 'completado') {
            const missingSteps = FLOW_STEPS.filter(s => !record[s.key]);
            if (missingSteps.length > 0) {
                showNotification(`No se puede completar: faltan ${missingSteps.length} pasos por confirmar.`, 'error');
                return;
            }

            const creditos = parseFloat(record.creditos_fundae) || 0;
            const facturado = parseFloat(record.facturado) || 0;

            if (creditos === 0 || creditos !== facturado) {
                showNotification('No se puede completar: los créditos deben coincidir con el total facturado.', 'error');
                return;
            }
        }

        // For Incidence/Cancel, we REQUIRE a comment
        if (newStatus === 'incidencia' || newStatus === 'cancelado') {
            setCommentData({ record, status: newStatus, comment: '' });
            setIsCommentModalOpen(true);
            return;
        }

        // For other direct changes (or if no comment needed), trigger webhook
        await triggerStatusWebhook(record, { status: newStatus });
    };

    const triggerStatusWebhook = async (record, data) => {
        const webhookUrl = import.meta.env.VITE_WEBHOOK_FORMULARIO_FUNDAE_URL;
        if (!webhookUrl) {
            showNotification('Webhook FUNDAE no configurado.', 'error');
            return;
        }

        await withLoading(async () => {
            try {
                const payload = {
                    action: 'update_status',
                    fundae_id: record.id,
                    lead_id: record.lead_id,
                    empresa: record.empresa,
                    cif: record.cif,
                    email: record.email || record.leads?.email,
                    telefono: record.telefono || record.leads?.whatsapp,
                    ...data
                };

                const res = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error(`Error: ${res.status}`);
                showNotification(`Solicitud de estado "${newStatus || 'actualizado'}" enviada.`);
                setIsCommentModalOpen(false);
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Actualizando estado...');
    };

    // ── Avanzar paso secuencialmente ────────────────────────────────────────
    const handleAdvanceStep = async (record) => {
        const webhookUrl = import.meta.env.VITE_WEBHOOK_FORMULARIO_FUNDAE_URL;

        if (!webhookUrl) {
            showNotification('Webhook FUNDAE no configurado.', 'error');
            return;
        }

        const currentStepIndex = FLOW_STEPS.findIndex(s => !record[s.key]);
        const currentStep = currentStepIndex !== -1 ? FLOW_STEPS[currentStepIndex] : null;

        if (!currentStep) {
            showNotification('El expediente ya está completado.', 'success');
            return;
        }

        // El paso actual en revisión. Si están en el 0 (pendiente de enviar), 
        // el siguiente paso (currentStepIndex) será "formulario_enviado" (1) o "formulario_pendiente_enviar" (0) si por lo que sea estuviera a false.
        if (currentStep.key === 'formulario_pendiente_enviar' || currentStep.key === 'formulario_enviado') {
            const confirmed = await confirm({
                title: 'Enviar Formulario FUNDAE',
                message: '¿Quieres enviar el formulario de FUNDAE (generando automáticamente el enlace y lanzando el correo)?',
                confirmText: 'Sí, enviar',
                cancelText: 'Cancelar'
            });

            if (!confirmed) {
                return; // Bloqueamos la ejecución si cancela
            }

            await withLoading(async () => {
                try {
                    const emailToSend = record.email || record.leads?.email;
                    if (!emailToSend) {
                        showNotification('No se puede enviar: el expediente no tiene un email válido vinculado.', 'error');
                        return;
                    }

                    // 1. Insertar directamente en la tabla (esto disparará el Webhook nativo de Supabase)
                    const { error } = await supabase
                        .from('fundae_form_tokens')
                        .insert([
                            {
                                fundae_id: record.id,
                                email: emailToSend
                            }
                        ]);

                    if (error) {
                        console.error('Error insertando token:', error);
                        showNotification('Error al crear el token en base de datos. Verifica RLS o los datos.', 'error');
                        throw error;
                    }

                    showNotification('Formulario enviado (token generado y webhook disparado).', 'success');

                    // 2. Opcional pero recomendado: Actualizar el paso en local para que avance la UI "formulario_enviado = true"
                    const { error: updateErr } = await supabase
                        .from('fundae_seguimiento')
                        .update({ formulario_enviado: true, formulario_pendiente_enviar: true })
                        .eq('id', record.id);

                    if (updateErr) console.error('Error al actualizar el estado:', updateErr);

                    fetchRecords(); // Refrescar la tabla
                } catch (err) {
                    showNotification(`Error: ${err.message}`, 'error');
                }
            }, `Enviando formulario a ${record.empresa}...`);

            return; // FINALIZAR para que no ejecute el fetch() de webhooks genéricos justo abajo
        }

        // Validation for Créditos Verificados: must have numerical credit value
        if (currentStep.key === 'creditos_verificados') {
            const creditValue = parseFloat(record.creditos_fundae) || 0;
            if (creditValue <= 0) {
                showNotification('No se puede verificar el paso: introduce primero el importe de Créditos FUNDAE.', 'error');
                return;
            }
        }

        await withLoading(async () => {
            try {
                const payload = {
                    action: 'advance_step_request',
                    step: currentStep.key,
                    fundae_id: record.id,
                    lead_id: record.lead_id,
                    empresa: record.empresa,
                    cif: record.cif,
                    email: record.email || record.leads?.email,
                    telefono: record.telefono || record.leads?.whatsapp,
                    creditos_fundae: record.creditos_fundae || 0,
                    num_asistentes: record.num_asistentes || 0,
                    fecha_inicio: record.fecha_inicio,
                };

                const res = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error(`Error: ${res.status}`);
                showNotification(`Solicitud para "${currentStep.short}" enviada.`);
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, `Avanzando paso...`);
    };

    useEffect(() => {
        fetchRecords();
        const channel = supabase
            .channel('fundae-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fundae_seguimiento' }, fetchRecords)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const filteredRecords = filterEstado === 'todos'
        ? records
        : records.filter(r => r.estado === filterEstado);

    const stats = {
        todos: records.length,
        pendiente: records.filter(r => r.estado === 'pendiente').length,
        en_curso: records.filter(r => r.estado === 'en_curso').length,
        completado: records.filter(r => r.estado === 'completado').length,
        incidencia: records.filter(r => r.estado === 'incidencia').length,
        cancelado: records.filter(r => r.estado === 'cancelado').length,
    };

    const openCreateModal = () => {
        setEditingRecord(null);
        setFormData(INITIAL_FORM);
        setIsModalOpen(true);
    };

    const openEditModal = (record) => {
        setEditingRecord(record);
        setFormData({
            empresa: record.empresa || '',
            cif: record.cif || '',
            email: record.email || '',
            telefono: record.telefono || '',
            creditos_fundae: record.creditos_fundae ?? '',
            facturado: record.facturado ?? '',
            pagado: record.pagado ?? '',
            num_asistentes: record.num_asistentes ?? '',
            formulario_pendiente_enviar: record.formulario_pendiente_enviar || false,
            formulario_enviado: record.formulario_enviado || false,
            formulario_recibido: record.formulario_recibido || false,
            creditos_verificados: record.creditos_verificados || false,
            factura_enviada: record.factura_enviada || false,
            factura_pagada: record.factura_pagada || false,
            ficha_alumno_enviada: record.ficha_alumno_enviada || false,
            estado: record.estado || 'pendiente',
            comentarios: record.comentarios || ''
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setTimeout(() => { setEditingRecord(null); setFormData(INITIAL_FORM); }, 300);
    };

    const setField = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        await withLoading(async () => {
            try {
                const payload = {
                    empresa: formData.empresa,
                    cif: formData.cif || null,
                    email: formData.email || null,
                    telefono: formData.telefono || null,
                    creditos_fundae: parseFloat(formData.creditos_fundae) || 0,
                    facturado: parseFloat(formData.facturado) || 0,
                    pagado: parseFloat(formData.pagado) || 0,
                    num_asistentes: parseInt(formData.num_asistentes) || 0,
                    formulario_pendiente_enviar: formData.formulario_pendiente_enviar,
                    formulario_enviado: formData.formulario_enviado,
                    formulario_recibido: formData.formulario_recibido,
                    creditos_verificados: formData.creditos_verificados,
                    factura_enviada: formData.factura_enviada,
                    factura_pagada: formData.factura_pagada,
                    ficha_alumno_enviada: formData.ficha_alumno_enviada,
                    estado: formData.estado,
                    comentarios: formData.comentarios || null
                };

                // Removed auto-completion logic for the first step and overall completion.
                // This will now be handled by webhooks/initial state.

                if (editingRecord) {
                    const { error } = await supabase.from('fundae_seguimiento').update(payload).eq('id', editingRecord.id);
                    if (error) throw error;
                    showNotification('Expediente actualizado');
                } else {
                    const { error } = await supabase.from('fundae_seguimiento').insert([payload]);
                    if (error) throw error;
                    showNotification('Expediente FUNDAE creado');
                }
                closeModal();
                fetchRecords();
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, editingRecord ? 'Actualizando...' : 'Creando expediente...');
    };

    const handleDelete = async (record) => {
        const confirmed = await confirm({
            title: '¿Eliminar Expediente?',
            message: `¿Estás seguro de que deseas eliminar el expediente de ${record.empresa}?`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });
        if (!confirmed) return;

        await withLoading(async () => {
            const { error } = await supabase.from('fundae_seguimiento').delete().eq('id', record.id);
            if (error) showNotification(`Error: ${error.message}`, 'error');
            else { showNotification('Expediente eliminado'); fetchRecords(); }
        }, 'Eliminando...');
    };

    const TABS = [
        { id: 'todos', label: 'Todos' },
        { id: 'pendiente', label: 'Pendiente' },
        { id: 'en_curso', label: 'En Curso' },
        { id: 'completado', label: 'Completado' },
        { id: 'incidencia', label: 'Incidencia' },
        { id: 'cancelado', label: 'Cancelado' }
    ];

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">
                            Seguimiento FUNDAE
                        </h1>
                        <p className="text-variable-muted">Gestión de expedientes de formación bonificada</p>
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button onClick={fetchRecords} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            <Clock size={20} />
                        </button>
                        <button onClick={openCreateModal} className="flex-1 sm:flex-none bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                            <Plus size={20} /> <span>Nuevo Expediente</span>
                        </button>
                    </div>
                </header>

                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
                    {[
                        { key: 'pendiente', label: 'Pendientes', icon: Clock, color: 'text-amber-500' },
                        { key: 'en_curso', label: 'En Curso', icon: Loader2, color: 'text-blue-500' },
                        { key: 'completado', label: 'Completados', icon: CheckCircle, color: 'text-emerald-500' },
                        { key: 'incidencia', label: 'Incidencias', icon: AlertCircle, color: 'text-rose-500' },
                        { key: 'cancelado', label: 'Cancelados', icon: X, color: 'text-gray-500' },
                    ].map(({ key, label, icon: Icon, color }) => (
                        <div key={key} className="glass rounded-2xl p-4 flex items-center gap-3">
                            <Icon size={20} className={color} />
                            <div>
                                <p className="text-xl font-black text-variable-main">{stats[key]}</p>
                                <p className="text-[10px] text-variable-muted uppercase font-bold tracking-widest">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-8 bg-white/5 p-1.5 rounded-[1.5rem] border border-variable w-fit">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterEstado(tab.id)}
                            className={`px-5 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filterEstado === tab.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'text-variable-muted hover:text-variable-main'}`}
                        >
                            {tab.label}
                            <span className="px-2 py-0.5 rounded-md bg-black/10 text-[9px]">{stats[tab.id]}</span>
                        </button>
                    ))}
                </div>

                <DataTable
                    tableId="fundae"
                    loading={loading}
                    data={filteredRecords}
                    rowKey="id"
                    columns={[
                        {
                            key: 'empresa',
                            label: 'Empresa',
                            render: (r) => (
                                <div>
                                    <p className="font-bold text-variable-main">{r.empresa || r.leads?.empresa_nombre || '—'}</p>
                                    {r.leads?.nombre && <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{r.leads.nombre}</p>}
                                </div>
                            )
                        },
                        {
                            key: 'creditos_fundae',
                            label: 'Créditos €',
                            render: (r) => (
                                <span className="font-bold text-primary">
                                    {r.creditos_fundae > 0 ? `${Number(r.creditos_fundae).toLocaleString('es-ES')} €` : '—'}
                                </span>
                            )
                        },
                        {
                            key: 'facturado',
                            label: 'Facturado / Pagado',
                            render: (r) => (
                                <div className="text-sm">
                                    <span className="text-variable-muted">{r.facturado > 0 ? `${Number(r.facturado).toLocaleString('es-ES')} €` : '—'}</span>
                                    {r.pagado > 0 && <span className="ml-1 text-emerald-500 font-bold"> / {Number(r.pagado).toLocaleString('es-ES')} € ✓</span>}
                                </div>
                            )
                        },
                        {
                            key: 'flujo',
                            label: 'Progreso del Expediente',
                            render: (r) => <FlowProgress record={r} />
                        },
                        {
                            key: 'estado',
                            label: 'Estado',
                            render: (r) => {
                                const cfg = ESTADO_CONFIG[r.estado] || ESTADO_CONFIG.pendiente;
                                return (
                                    <span className={`px-3 py-1 rounded-lg text-[10px] uppercase font-black border ${cfg.color}`}>
                                        {cfg.label}
                                    </span>
                                );
                            }
                        },
                        {
                            key: 'fecha_inicio',
                            label: 'Inicio',
                            render: (r) => <span className="text-variable-muted text-sm">{new Date(r.fecha_inicio).toLocaleDateString('es-ES')}</span>
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (r) => {
                                const isAllDone = FLOW_STEPS.every(s => r[s.key]);
                                const canComplete = isAllDone && r.estado !== 'completado';

                                return (
                                    <div className="flex gap-2 justify-end">
                                        {/* Siguiente Paso */}
                                        {!isAllDone && r.estado !== 'cancelado' && (
                                            <button
                                                onClick={() => handleAdvanceStep(r)}
                                                title="Avanzar al siguiente paso"
                                                className="p-2 glass rounded-xl text-variable-muted hover:text-emerald-500 transition-colors"
                                            >
                                                <CheckCircle size={15} />
                                            </button>
                                        )}

                                        {/* Completar Rápido */}
                                        {canComplete && (
                                            <button
                                                onClick={() => handleStatusChangeRequest(r, 'completado')}
                                                title="Marcar como Completado"
                                                className="p-2 glass rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                                            >
                                                <ShieldCheck size={15} />
                                            </button>
                                        )}

                                        {/* Incidencia */}
                                        {r.estado !== 'incidencia' && r.estado !== 'completado' && r.estado !== 'cancelado' && (
                                            <button
                                                onClick={() => handleStatusChangeRequest(r, 'incidencia')}
                                                title="Marcar Incidencia"
                                                className="p-2 glass rounded-xl text-variable-muted hover:text-rose-500 transition-colors"
                                            >
                                                <AlertTriangle size={15} />
                                            </button>
                                        )}

                                        {/* Cancelar */}
                                        {r.estado !== 'cancelado' && r.estado !== 'completado' && (
                                            <button
                                                onClick={() => handleStatusChangeRequest(r, 'cancelado')}
                                                title="Cancelar Expediente"
                                                className="p-2 glass rounded-xl text-variable-muted hover:text-gray-500 transition-colors"
                                            >
                                                <Ban size={15} />
                                            </button>
                                        )}

                                        {/* Enviar formulario */}
                                        {!r.formulario_enviado && (
                                            <button
                                                onClick={() => handleSendFormulario(r)}
                                                title="Enviar formulario FUNDAE al lead"
                                                className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                                            >
                                                <Send size={15} />
                                            </button>
                                        )}
                                        <button onClick={() => openEditModal(r)} className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-colors text-xs font-bold px-3">
                                            Editar
                                        </button>
                                        <button onClick={() => handleDelete(r)} className="p-2 glass rounded-xl text-variable-muted hover:text-rose-500 transition-colors">
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                );
                            }
                        }
                    ]}
                />
            </main>

            {/* Edit Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            key={editingRecord?.id || 'new'}
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl max-h-[90vh] overflow-y-auto"
                        >
                            <button onClick={closeModal} className="absolute top-8 right-8 text-variable-muted hover:text-primary transition-colors"><X size={24} /></button>
                            <h2 className="text-3xl font-bold font-display mb-8 text-variable-main">
                                {editingRecord ? 'Editar Expediente' : 'Nuevo Expediente FUNDAE'}
                            </h2>

                            <form onSubmit={handleSubmit} className="space-y-6">

                                {/* Empresa */}
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2">Datos de la Empresa</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Empresa *</label>
                                        <input required value={formData.empresa} onChange={e => setField('empresa', e.target.value)} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Nombre despacho" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">CIF</label>
                                        <input value={formData.cif} onChange={e => setField('cif', e.target.value)} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all font-mono" placeholder="B12345678" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email</label>
                                        <input type="email" value={formData.email} onChange={e => setField('email', e.target.value)} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="email@empresa.com" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Teléfono</label>
                                        <input value={formData.telefono} onChange={e => setField('telefono', e.target.value)} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="+34 600 000 000" />
                                    </div>
                                </div>

                                {/* Financiero */}
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 pt-2">Datos Financieros</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {[
                                        { key: 'creditos_fundae', label: 'Créditos €' },
                                        { key: 'facturado', label: 'Facturado €' },
                                        { key: 'pagado', label: 'Pagado €' },
                                        { key: 'num_asistentes', label: 'Asistentes', int: true },
                                    ].map(({ key, label, int }) => {
                                        // "Créditos" is only editable if "Formulario Recibido" is true
                                        // "Facturado" is only editable if "Créditos Verificados" is true
                                        // "Pagado" is only editable if "Factura Enviada" is true
                                        let isLocked = false;
                                        if (key === 'creditos_fundae' && !formData.formulario_recibido) isLocked = true;
                                        if (key === 'facturado' && !formData.creditos_verificados) isLocked = true;
                                        if (key === 'pagado' && !formData.factura_enviada) isLocked = true;

                                        return (
                                            <div key={key} className="space-y-2">
                                                <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">
                                                    {label} {isLocked && '🔒'}
                                                </label>
                                                <input
                                                    type="number"
                                                    step={int ? '1' : '0.01'}
                                                    value={formData[key]}
                                                    disabled={isLocked}
                                                    onChange={e => setField(key, e.target.value)}
                                                    className={`w-full bg-white/5 border rounded-2xl px-4 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all ${isLocked ? 'opacity-40 border-variable' : 'border-variable hover:border-primary/30'}`}
                                                    placeholder="0"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Flujo de pasos */}
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 pt-2">Flujo del Expediente</p>
                                <div className="space-y-2">
                                    {FLOW_STEPS.map((step, i) => {
                                        const prevDone = i === 0 || formData[FLOW_STEPS[i - 1].key];
                                        const isCurrent = !formData[step.key] && prevDone;
                                        return (
                                            <ToggleStep
                                                key={step.key}
                                                step={step}
                                                index={i}
                                                checked={formData[step.key]}
                                                onChange={v => {
                                                    // Validation: Cannot set creditos_verificados to true if amount is 0
                                                    if (step.key === 'creditos_verificados' && v) {
                                                        const creditValue = parseFloat(formData.creditos_fundae) || 0;
                                                        if (creditValue <= 0) {
                                                            showNotification('Introduce el importe de créditos antes de marcar este paso como verificado.', 'error');
                                                            return;
                                                        }
                                                    }
                                                    setField(step.key, v);
                                                }}
                                                disabled={!prevDone && !formData[step.key]}
                                                isCurrent={isCurrent}
                                            />
                                        );
                                    })}
                                </div>

                                {/* Estado y comentarios */}
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 pt-2">Estado y Notas</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Estado Expediente</label>
                                        <select value={formData.estado} onChange={e => setField('estado', e.target.value)} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all appearance-none cursor-pointer">
                                            <option value="pendiente" className="bg-[#003865]">Pendiente</option>
                                            <option value="en_curso" className="bg-[#003865]">En Curso</option>
                                            <option value="completado" className="bg-[#003865]">Completado</option>
                                            <option value="incidencia" className="bg-[#003865]">Incidencia</option>
                                            <option value="cancelado" className="bg-[#003865]">Cancelado</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Comentarios / Dudas</label>
                                        <textarea value={formData.comentarios} onChange={e => setField('comentarios', e.target.value)} rows={3} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all resize-none" placeholder="Anotaciones, incidencias..." />
                                    </div>
                                </div>

                                <button type="submit" className="w-full py-5 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-4 flex items-center justify-center gap-2">
                                    <ShieldCheck size={20} /> {editingRecord ? 'Actualizar Expediente' : 'Crear Expediente'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Comment / Incidence Modal */}
            <AnimatePresence>
                {isCommentModalOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCommentModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-lg glass rounded-[2rem] p-8 shadow-2xl"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className={`p-3 rounded-2xl ${commentData.status === 'incidencia' ? 'bg-rose-500/20 text-rose-500' : 'bg-gray-500/20 text-gray-500'}`}>
                                    {commentData.status === 'incidencia' ? <AlertTriangle size={24} /> : <Ban size={24} />}
                                </div>
                                <h3 className="text-xl font-bold text-variable-main">
                                    {commentData.status === 'incidencia' ? 'Reportar Incidencia' : 'Cancelar Expediente'}
                                </h3>
                            </div>

                            <p className="text-sm text-variable-muted mb-6 leading-relaxed">
                                Por favor, indica el motivo o la duda relevante para el expediente de <strong>{commentData.record?.empresa}</strong>. Este comentario se guardará en la base de datos.
                            </p>

                            <textarea
                                autoFocus
                                value={commentData.comment}
                                onChange={e => setCommentData(prev => ({ ...prev, comment: e.target.value }))}
                                className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all resize-none mb-6"
                                rows={4}
                                placeholder="Escribe aquí el motivo..."
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsCommentModalOpen(false)}
                                    className="flex-1 py-4 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all"
                                >
                                    Cerrar
                                </button>
                                <button
                                    disabled={!commentData.comment.trim()}
                                    onClick={() => triggerStatusWebhook(commentData.record, { status: commentData.status, comentarios: commentData.comment })}
                                    className={`flex-[2] py-4 rounded-2xl font-bold text-white transition-all shadow-lg ${commentData.status === 'incidencia' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-gray-600 shadow-gray-600/20'} disabled:opacity-50 disabled:grayscale`}
                                >
                                    Confirmar Cambio
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
