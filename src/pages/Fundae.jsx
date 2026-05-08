import React, { useState, useEffect, useRef } from 'react';
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
    RotateCw,
    AlertTriangle,
    Ban,
    Trash2,
    Coins,
    Download,
    Upload,
    FileSignature,
    FileText,
    Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import FacturaModal from '../components/fundae/FacturaModal';
import FichasFundaeList from '../components/fundae/FichasFundaeList';
import EncuestasFundaeSection from '../components/fundae/EncuestasFundaeSection';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

// ── Flujo del expediente FUNDAE ────────────────────────────────────────
const FLOW_STEPS = [
    { key: 'formulario_pendiente_enviar', label: 'Formulario pendiente de enviar', short: 'Pend. Enviar' },
    { key: 'formulario_enviado', label: 'Formulario enviado', short: 'Form. Env.' },
    { key: 'formulario_cumplimentado', label: 'Formulario cumplimentado', short: 'Form. Cumpl.' },
    { key: 'formulario_recibido', label: 'Formulario recibido', short: 'Form. Rec.' },
    { key: 'creditos_verificados', label: 'Créditos verificados', short: 'Créditos' },
    { key: 'factura_creada', label: 'Factura creada', short: 'Fact. Creada' },
    { key: 'factura_enviada', label: 'Factura enviada', short: 'Fact. Env.' },
    { key: 'factura_pagada', label: 'Factura pagada', short: 'Fact. Pag.' },
    { key: 'enlace_fichas_enviado', label: 'Enlace de fichas enviado', short: 'Enlace fichas' },
    { key: 'fichas_firmadas', label: 'Fichas de alumnos firmadas', short: 'Fichas firm.' },
    { key: 'fichas_verificadas', label: 'Fichas verificadas', short: 'Fichas verif.' },
    { key: 'alumnos_convertidos', label: 'Alumnos convertidos', short: 'Alumnos' },
];

// Pasos derivados (no editables manualmente, los calcula un trigger SQL desde fundae_alumnos)
const DERIVED_FICHAS_STEPS = new Set(['fichas_firmadas', 'fichas_verificadas', 'alumnos_convertidos']);

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
    formulario_cumplimentado: false,
    formulario_recibido: false,
    creditos_verificados: false,
    factura_creada: false,
    factura_enviada: false,
    factura_pagada: false,
    enlace_fichas_enviado: false,
    fichas_firmadas: false,
    fichas_verificadas: false,
    alumnos_convertidos: false,
    estado: 'pendiente',
    comentarios: '',
    numero_expediente_fundae: ''
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
    const displayNum = isFullyDone ? FLOW_STEPS.length : lastTrueIndex;
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
    const [search, setSearch] = useState('');

    // Comment modal state for quick actions (Incidencia / Cancelar)
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [commentData, setCommentData] = useState({
        record: null,
        status: '', // 'incidencia', 'cancelado', 'completado'
        comment: ''
    });

    // Credits Modal State
    const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
    const [creditsInputData, setCreditsInputData] = useState({ record: null, amount: '' });

    // Factura Modal State
    const [facturaModalRecord, setFacturaModalRecord] = useState(null);

    // PDF firmado: input file oculto + record activo (sobre cuál se está subiendo)
    const fileInputRef = useRef(null);
    const [uploadingFor, setUploadingFor] = useState(null);

    // Fichas de alumnos del expediente actualmente abierto
    const [fichasExpediente, setFichasExpediente] = useState([]);
    const fetchFichasExpediente = async (fundaeId) => {
        if (!fundaeId) { setFichasExpediente([]); return; }
        const { data } = await supabase.from('fundae_alumnos').select('*').eq('fundae_id', fundaeId).order('created_at');
        setFichasExpediente(data || []);
    };
    useEffect(() => {
        if (editingRecord?.id) fetchFichasExpediente(editingRecord.id);
        else setFichasExpediente([]);
    }, [editingRecord?.id]);

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('fundae_seguimiento')
                .select('*, leads(nombre, empresa_nombre, email, whatsapp, lead_billing(factura_pdf_path, numero_factura))')
                .order('fecha_inicio', { ascending: false });
            if (error) throw error;
            setRecords(data || []);
        } catch (err) {
            console.error('Error fetching FUNDAE:', err);
        } finally {
            setLoading(false);
        }
    };

    // ── Descargar el PDF de la factura ──
    const handleDownloadFactura = async (record) => {
        const billing = Array.isArray(record.leads?.lead_billing)
            ? record.leads.lead_billing[0]
            : record.leads?.lead_billing;
        const path = billing?.factura_pdf_path;
        if (!path) {
            showNotification('Esta factura todavía no se ha generado.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.storage
                    .from('facturas')
                    .createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank', 'noopener');
            } catch (err) {
                showNotification(`No se pudo descargar la factura: ${err.message}`, 'error');
            }
        }, 'Generando enlace a la factura...');
    };

    // ── Descargar el PDF del expediente (firmado si existe, si no el pendiente) ──
    const handleDownloadExpediente = async (record) => {
        const path = record.expediente_firmado_path || record.expediente_pdf_path;
        if (!path) {
            showNotification('Este expediente todavía no tiene PDF generado.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.storage
                    .from('fundae-docs')
                    .createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank', 'noopener');
            } catch (err) {
                showNotification(`No se pudo descargar el PDF: ${err.message}`, 'error');
            }
        }, 'Generando enlace al expediente...');
    };

    // ── Click en botón de subir PDF firmado: abre el input file ──
    const handleUploadFirmadoClick = (record) => {
        if (!record.expediente_pdf_path) {
            showNotification('No hay un PDF base en este expediente. El cliente debe cumplimentar el formulario primero.', 'error');
            return;
        }
        setUploadingFor(record);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    // ── Sube el PDF firmado, sobreescribe el pendiente y avanza el paso "formulario_recibido" ──
    const handleFirmadoFileChange = async (e) => {
        const file = e.target.files?.[0];
        const record = uploadingFor;
        e.target.value = '';
        if (!file || !record) return;

        if (file.type !== 'application/pdf') {
            showNotification('El archivo debe ser un PDF.', 'error');
            setUploadingFor(null);
            return;
        }

        let success = false;
        await withLoading(async () => {
            try {
                const path = `${record.id}/expediente_firmado.pdf`;
                const { error: upErr } = await supabase.storage
                    .from('fundae-docs')
                    .upload(path, file, { contentType: 'application/pdf', upsert: true });
                if (upErr) throw upErr;

                const { error: updErr } = await supabase
                    .from('fundae_seguimiento')
                    .update({
                        expediente_firmado_path: path,
                        expediente_estado: 'firmado',
                        expediente_firmado_at: new Date().toISOString(),
                        formulario_recibido: true
                    })
                    .eq('id', record.id);
                if (updErr) throw updErr;

                showNotification('✅ PDF firmado subido. Paso "Formulario recibido" marcado.');
                success = true;
            } catch (err) {
                showNotification(`Error subiendo PDF firmado: ${err.message}`, 'error');
            } finally {
                setUploadingFor(null);
            }
        }, 'Subiendo PDF firmado...');

        if (success) {
            // Pequeño retraso para que el usuario vea la notificación de éxito antes del reload
            setTimeout(() => window.location.reload(), 800);
        }
    };

    // ── Enviar formulario FUNDAE al lead (RPC send_fundae_form en BD: token + pasos + estado en_curso; un solo webhook notify_n8n) ──
    const handleSendFormulario = async (record) => {
        const emailToSend = record.email || record.leads?.email;
        if (!emailToSend) {
            showNotification('No se puede enviar: el expediente no tiene un email válido vinculado.', 'error');
            return;
        }

        // Si ya hay un PDF firmado por el cliente, reenviar lo invalidaría al sobrescribir
        // expediente_estado='pendiente_firma'. Bloqueamos para no perder la firma.
        if (record.expediente_estado === 'firmado') {
            showNotification('Este expediente ya está firmado. No se puede reenviar el formulario sin perder la firma actual.', 'error');
            return;
        }

        const isResend = !!record.formulario_enviado;
        await withLoading(async () => {
            try {
                const { error } = await supabase.rpc('send_fundae_form', {
                    p_fundae_id: record.id
                });

                if (error) throw error;

                showNotification(isResend
                    ? `✅ Formulario reenviado a ${record.empresa} (enlace anterior invalidado).`
                    : `✅ Formulario enviado a ${record.empresa}`);
                fetchRecords();
            } catch (err) {
                showNotification(`Error al enviar formulario: ${err.message}`, 'error');
            }
        }, isResend ? `Reenviando formulario a ${record.empresa}...` : `Enviando formulario a ${record.empresa}...`);
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
        await withLoading(async () => {
            try {
                const updatePayload = { estado: data.status };
                if (data.comentarios !== undefined) updatePayload.comentarios = data.comentarios;

                const { error } = await supabase
                    .from('fundae_seguimiento')
                    .update(updatePayload)
                    .eq('id', record.id);

                if (error) throw error;

                showNotification(`Estado actualizado a "${data.status}".`);
                setIsCommentModalOpen(false);
                fetchRecords();
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Actualizando estado...');
    };

    // ── Avanzar paso secuencialmente ────────────────────────────────────────
    const handleAdvanceStep = async (record) => {
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

                    const { error } = await supabase.rpc('send_fundae_form', {
                        p_fundae_id: record.id
                    });

                    if (error) {
                        console.error('Error RPC send_fundae_form:', error);
                        showNotification('Error al crear el token / actualizar expediente.', 'error');
                        throw error;
                    }

                    showNotification('Formulario enviado (token generado y webhook disparado).', 'success');
                    fetchRecords();
                } catch (err) {
                    showNotification(`Error: ${err.message}`, 'error');
                }
            }, `Enviando formulario a ${record.empresa}...`);

            return; // FINALIZAR para que no ejecute el fetch() de webhooks genéricos justo abajo
        }

        // Validación para "Formulario recibido": exige PDF firmado por el cliente
        if (currentStep.key === 'formulario_recibido' && !record.expediente_firmado_path) {
            const choice = await confirm({
                title: 'Documento firmado pendiente',
                message: 'Para avanzar debes subir el documento firmado por el cliente. ¿Quieres subirlo ahora?',
                confirmText: 'Sí, subir',
                cancelText: 'Cancelar'
            });
            if (!choice) return;
            // Reutiliza el flujo existente: handleFirmadoFileChange ya marca formulario_recibido=true
            handleUploadFirmadoClick(record);
            return;
        }

        // Validation for Créditos Verificados: must have numerical credit value
        if (currentStep.key === 'creditos_verificados') {
            const creditValue = parseFloat(record.creditos_fundae) || 0;
            if (creditValue <= 0) {
                // Open credits modal instead of just showing an error notification
                setCreditsInputData({
                    record: record,
                    amount: ''
                });
                setIsCreditsModalOpen(true);
                return;
            }
        }

        // Factura Creada: no se avanza con un toggle simple — abre el modal de creación.
        // El modal genera el PDF, lo sube a Storage, persiste en lead_billing y marca factura_creada=true (vía trigger).
        if (currentStep.key === 'factura_creada') {
            setFacturaModalRecord(record);
            return;
        }

        // Factura Enviada: actualiza lead_billing.estado_factura='enviada' (el trigger sincroniza el espejo).
        if (currentStep.key === 'factura_enviada') {
            const confirmed = await confirm({
                title: 'Marcar factura como enviada',
                message: `¿Confirmar que la factura ${record.empresa ? `de ${record.empresa}` : ''} ha sido enviada al cliente?`,
                confirmText: 'Sí, enviada',
                cancelText: 'Cancelar'
            });
            if (!confirmed) return;
            await withLoading(async () => {
                try {
                    const { error } = await supabase
                        .from('lead_billing')
                        .update({ estado_factura: 'enviada', fecha_factura_enviada: new Date().toISOString() })
                        .eq('lead_id', record.lead_id);
                    if (error) throw error;
                    showNotification('Factura marcada como enviada.', 'success');
                    fetchRecords();
                } catch (err) {
                    showNotification(`Error: ${err.message}`, 'error');
                }
            }, 'Marcando factura como enviada...');
            return;
        }

        // Enviar enlace de fichas al cliente (acción manual del admin).
        if (currentStep.key === 'enlace_fichas_enviado') {
            const confirmed = await confirm({
                title: 'Enviar enlace de fichas al cliente',
                message: `Se enviará un email a ${record.email || record.leads?.email || 'la dirección del cliente'} con el enlace para rellenar las fichas de inscripción de los alumnos. ¿Continuar?`,
                confirmText: 'Sí, enviar',
                cancelText: 'Cancelar'
            });
            if (!confirmed) return;
            await withLoading(async () => {
                try {
                    // 1. Generar token + activar flag enviar_alumnos_pendiente.
                    //    El listener realtime existente en este mismo componente
                    //    invoca la edge function send-fundae-alumnos-link al detectar el flag.
                    const { error: rpcErr } = await supabase.rpc('send_fundae_alumnos_link', { p_fundae_id: record.id });
                    if (rpcErr) throw rpcErr;

                    // 2. Marcar el paso del flujo.
                    const { error: upErr } = await supabase
                        .from('fundae_seguimiento')
                        .update({ enlace_fichas_enviado: true })
                        .eq('id', record.id);
                    if (upErr) throw upErr;

                    showNotification('✅ Enlace de fichas enviado al cliente.');
                    fetchRecords();
                } catch (err) {
                    showNotification(`Error: ${err.message}`, 'error');
                }
            }, 'Enviando enlace de fichas al cliente...');
            return;
        }

        // Pasos derivados de fichas de alumnos: abren el modal de edición del expediente,
        // donde está la sección "Fichas de alumnos" con los botones Verificar / Convertir.
        if (DERIVED_FICHAS_STEPS.has(currentStep.key)) {
            const messages = {
                fichas_firmadas: 'Pendiente de que el cliente firme todas las fichas. Recibió el enlace al marcar la factura como pagada.',
                fichas_verificadas: 'Hay fichas firmadas pendientes de verificar. Abre el expediente y verifica cada una.',
                alumnos_convertidos: 'Hay fichas verificadas pendientes de convertir a alumno.'
            };
            showNotification(messages[currentStep.key] || '', 'info');
            openEditModal(record);
            return;
        }

        // Factura Pagada: actualiza lead_billing.estado_factura='pagada' (el trigger sincroniza espejo y dispara fichas).
        if (currentStep.key === 'factura_pagada') {
            const confirmed = await confirm({
                title: 'Marcar factura como pagada',
                message: 'Esto disparará automáticamente el envío del enlace de fichas de alumnos al cliente. ¿Continuar?',
                confirmText: 'Sí, pagada',
                cancelText: 'Cancelar'
            });
            if (!confirmed) return;
            await withLoading(async () => {
                try {
                    const { error } = await supabase
                        .from('lead_billing')
                        .update({ estado_factura: 'pagada', fecha_factura_pagada: new Date().toISOString() })
                        .eq('lead_id', record.lead_id);
                    if (error) throw error;

                    // Reflejar el importe pagado en fundae_seguimiento (espejo para la columna "Facturado / Pagado")
                    const importePagado = parseFloat(record.facturado) || 0;
                    if (importePagado > 0) {
                        await supabase
                            .from('fundae_seguimiento')
                            .update({ pagado: importePagado })
                            .eq('id', record.id);
                    }

                    showNotification('Factura pagada. Se enviarán las fichas de alumnos al cliente.', 'success');
                    fetchRecords();
                } catch (err) {
                    showNotification(`Error: ${err.message}`, 'error');
                }
            }, 'Marcando factura como pagada...');
            return;
        }

        await withLoading(async () => {
            try {
                const { error } = await supabase
                    .from('fundae_seguimiento')
                    .update({ [currentStep.key]: true })
                    .eq('id', record.id);

                if (error) throw error;

                showNotification(`Paso "${currentStep.short}" avanzado.`);
                fetchRecords();
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, `Avanzando paso...`);
    };

    const handleSaveAndAdvanceCredits = async () => {
        const amount = parseFloat(creditsInputData.amount);
        if (isNaN(amount) || amount <= 0) {
            showNotification('Por favor, indica un importe de cr\u00e9ditos v\u00e1lido.', 'error');
            return;
        }

        await withLoading(async () => {
            try {
                // 1. Actualizar en Supabase (Cr\u00e9ditos e marcar paso como completado)
                const { error } = await supabase
                    .from('fundae_seguimiento')
                    .update({ 
                        creditos_fundae: amount,
                        creditos_verificados: true 
                    })
                    .eq('id', creditsInputData.record.id);

                if (error) throw error;

                showNotification('Cr\u00e9ditos verificados y paso actualizado.', 'success');
                setIsCreditsModalOpen(false);
                fetchRecords(); // Actualizar tabla
            } catch (err) {
                console.error('Error saving credits:', err);
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Guardando y avanzando...');
    };

    useEffect(() => {
        fetchRecords();
        const channel = supabase
            .channel('fundae-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fundae_seguimiento' }, fetchRecords)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    // Auto-envío del enlace de fichas de alumnos cuando el trigger marca enviar_alumnos_pendiente=true.
    // Idempotente: solo envía si alumnos_link_enviado_at es nulo.
    useEffect(() => {
        const pendientes = records.filter(r => r.enviar_alumnos_pendiente && !r.alumnos_link_enviado_at);
        if (pendientes.length === 0) return;
        let cancelled = false;
        (async () => {
            for (const rec of pendientes) {
                try {
                    const { data: tok } = await supabase.rpc('issue_fundae_alumnos_token', { p_fundae_id: rec.id });
                    if (!tok || cancelled) continue;
                    const publicUrl = `${window.location.origin}/fundae-alumnos/${tok.token}`;

                    const { error: invokeErr } = await supabase.functions.invoke('send-fundae-alumnos-link', {
                        body: {
                            email: tok.email,
                            empresa: tok.empresa,
                            public_url: publicUrl,
                            num_alumnos: rec.num_asistentes || 0
                        }
                    });
                    if (invokeErr) { console.error('[ALUMNOS-LINK] invoke error:', invokeErr); continue; }

                    await supabase
                        .from('fundae_seguimiento')
                        .update({ alumnos_link_enviado_at: new Date().toISOString() })
                        .eq('id', rec.id);
                } catch (err) {
                    console.error('[ALUMNOS-LINK] error procesando expediente', rec.id, err);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [records]);

    const filteredByEstado = filterEstado === 'todos'
        ? records
        : records.filter(r => r.estado === filterEstado);

    const filteredRecords = (() => {
        const q = search.trim().toLowerCase();
        if (!q) return filteredByEstado;
        return filteredByEstado.filter(r => {
            const haystack = `${r.empresa || ''} ${r.cif || ''} ${r.email || ''} ${r.telefono || ''}`.toLowerCase();
            return haystack.includes(q);
        });
    })();

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
            formulario_cumplimentado: record.formulario_cumplimentado || false,
            formulario_recibido: record.formulario_recibido || false,
            creditos_verificados: record.creditos_verificados || false,
            factura_creada: record.factura_creada || false,
            factura_enviada: record.factura_enviada || false,
            factura_pagada: record.factura_pagada || false,
            enlace_fichas_enviado: record.enlace_fichas_enviado || false,
            fichas_firmadas: record.fichas_firmadas || false,
            fichas_verificadas: record.fichas_verificadas || false,
            alumnos_convertidos: record.alumnos_convertidos || false,
            estado: record.estado || 'pendiente',
            comentarios: record.comentarios || '',
            numero_expediente_fundae: record.numero_expediente_fundae || ''
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
                    formulario_cumplimentado: formData.formulario_cumplimentado,
                    formulario_recibido: formData.formulario_recibido,
                    creditos_verificados: formData.creditos_verificados,
                    // factura_creada / factura_enviada / factura_pagada NO se incluyen:
                    // son espejos de lead_billing y se sincronizan por trigger.
                    // fichas_firmadas / fichas_verificadas / alumnos_convertidos NO se incluyen:
                    // son derivados de fundae_alumnos y se sincronizan por trigger.
                    estado: formData.estado,
                    comentarios: formData.comentarios || null,
                    numero_expediente_fundae: formData.numero_expediente_fundae?.trim() || null
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

            {/* Input file oculto para subir PDF firmado */}
            <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFirmadoFileChange}
                className="hidden"
            />

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
                    toolbarLeft={
                        <div className="relative w-full max-w-md">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/5 border border-variable rounded-2xl pl-11 pr-5 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm"
                                placeholder="Buscar por empresa, CIF o email..."
                            />
                        </div>
                    }
                    columns={[
                        {
                            key: 'numero_expediente',
                            label: 'Nº Exp.',
                            render: (r) => (
                                <div className="text-xs">
                                    <p className="font-mono font-bold text-variable-main">{r.numero_expediente || '—'}</p>
                                    {r.numero_expediente_fundae && (
                                        <p className="font-mono text-[10px] text-variable-muted mt-0.5" title="Nº FUNDAE">
                                            FUNDAE: {r.numero_expediente_fundae}
                                        </p>
                                    )}
                                </div>
                            )
                        },
                        {
                            key: 'empresa',
                            label: 'Empresa',
                            render: (r) => (
                                <div>
                                    <p className="font-bold text-variable-main">{r.empresa || r.leads?.empresa_nombre || '—'}</p>
                                    {r.expediente_estado && (
                                        <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider ${r.expediente_estado === 'firmado' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'}`}>
                                            <FileSignature size={10} />
                                            {r.expediente_estado === 'firmado' ? 'Firmado' : 'Pend. firma'}
                                        </span>
                                    )}
                                </div>
                            )
                        },
                        {
                            key: 'contacto',
                            label: 'Contacto',
                            render: (r) => {
                                const nombre = r.leads?.nombre || r.representante_empresa || '—';
                                const email = r.leads?.email || r.email;
                                return (
                                    <div>
                                        <p className="font-medium text-variable-main text-sm">{nombre}</p>
                                        {email && <p className="text-[11px] text-variable-muted">{email}</p>}
                                    </div>
                                );
                            }
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

                                        {/* Enviar formulario (primer envío) */}
                                        {!r.formulario_enviado && (
                                            <button
                                                onClick={() => handleSendFormulario(r)}
                                                title="Enviar formulario FUNDAE al cliente"
                                                className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                                            >
                                                <Send size={15} />
                                            </button>
                                        )}

                                        {/* Reenviar formulario (ya enviado pero aún no recibido y sin firma). Genera nuevo token e invalida los anteriores. */}
                                        {r.formulario_enviado && !r.formulario_recibido && r.expediente_estado !== 'firmado' && (
                                            <button
                                                onClick={() => handleSendFormulario(r)}
                                                title="Reenviar formulario (genera un nuevo enlace e invalida el anterior)"
                                                className="p-2 glass rounded-xl text-amber-500 hover:bg-amber-500/10 transition-colors border border-transparent hover:border-amber-500/20"
                                            >
                                                <RotateCw size={15} />
                                            </button>
                                        )}

                                        {/* Descargar PDF (firmado si existe, si no pendiente) */}
                                        {r.expediente_pdf_path && (
                                            <button
                                                onClick={() => handleDownloadExpediente(r)}
                                                title={r.expediente_estado === 'firmado' ? 'Descargar PDF firmado' : 'Descargar PDF (pendiente de firma)'}
                                                className={`p-2 glass rounded-xl transition-colors border border-transparent ${r.expediente_estado === 'firmado' ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-amber-500 hover:bg-amber-500/10'}`}
                                            >
                                                <Download size={15} />
                                            </button>
                                        )}

                                        {/* Subir PDF firmado (solo si hay pendiente y aún no firmado) */}
                                        {r.expediente_pdf_path && r.expediente_estado !== 'firmado' && (
                                            <button
                                                onClick={() => handleUploadFirmadoClick(r)}
                                                title="Subir PDF firmado por el cliente"
                                                className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                                            >
                                                <Upload size={15} />
                                            </button>
                                        )}

                                        {/* Descargar factura (si existe PDF de factura) */}
                                        {r.factura_creada && (() => {
                                            const billing = Array.isArray(r.leads?.lead_billing) ? r.leads.lead_billing[0] : r.leads?.lead_billing;
                                            if (!billing?.factura_pdf_path) return null;
                                            return (
                                                <button
                                                    onClick={() => handleDownloadFactura(r)}
                                                    title={`Descargar factura ${billing.numero_factura || ''}`}
                                                    className="p-2 glass rounded-xl text-blue-500 hover:bg-blue-500/10 transition-colors border border-transparent hover:border-blue-500/20"
                                                >
                                                    <FileText size={15} />
                                                </button>
                                            );
                                        })()}
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
                                {editingRecord
                                    ? <>Editar Expediente {editingRecord.numero_expediente && <span className="text-primary font-mono text-2xl">{editingRecord.numero_expediente}</span>}</>
                                    : 'Nuevo Expediente FUNDAE'}
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

                                {/* Identificación del expediente */}
                                {editingRecord && (
                                    <>
                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 pt-2">Identificación</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nº Expediente (interno)</label>
                                                <input
                                                    value={editingRecord.numero_expediente || ''}
                                                    readOnly
                                                    className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main font-mono cursor-not-allowed opacity-70"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nº Expediente FUNDAE</label>
                                                <input
                                                    value={formData.numero_expediente_fundae}
                                                    onChange={e => setField('numero_expediente_fundae', e.target.value)}
                                                    className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all font-mono"
                                                    placeholder="Asignado por FUNDAE"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

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
                                        const isDone = !!formData[step.key];
                                        // Solo es el paso actual el primer pendiente cuyo paso anterior está hecho.
                                        const isCurrent = !isDone && prevDone;
                                        return (
                                            <ToggleStep
                                                key={step.key}
                                                step={step}
                                                index={i}
                                                checked={isDone}
                                                onChange={v => {
                                                    // Solo se puede tocar el paso actual; el resto bloqueado.
                                                    if (!isCurrent) return;
                                                    if (v && editingRecord) handleAdvanceStep(editingRecord);
                                                }}
                                                disabled={!isCurrent}
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

                                {editingRecord && (
                                    <>
                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 pt-2">
                                            Fichas de alumnos ({fichasExpediente.length})
                                        </p>
                                        <FichasFundaeList
                                            fichas={fichasExpediente}
                                            onRefresh={() => fetchFichasExpediente(editingRecord.id)}
                                            onAllVerified={async () => {
                                                if (!editingRecord) return;
                                                if (editingRecord.fichas_verificadas) {
                                                    closeModal();
                                                    return;
                                                }
                                                const { error } = await supabase
                                                    .from('fundae_seguimiento')
                                                    .update({ fichas_verificadas: true })
                                                    .eq('id', editingRecord.id);
                                                if (error) {
                                                    showNotification('Error marcando paso: ' + error.message, 'error');
                                                    return;
                                                }
                                                showNotification('✅ Todas las fichas verificadas. Avanzando al siguiente paso.');
                                                fetchRecords();
                                                closeModal();
                                            }}
                                            showNotification={showNotification}
                                        />

                                        {(() => {
                                            // Tomamos el groupid de la primera ficha que lo tenga (todas comparten grupo).
                                            const groupid = fichasExpediente.find(f => f.evolcampus_groupid)?.evolcampus_groupid;
                                            if (!groupid) return null;
                                            return (
                                                <EncuestasFundaeSection groupid={groupid} />
                                            );
                                        })()}
                                    </>
                                )}

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

            {/* Credits Verification Modal */}
            <AnimatePresence>
                {isCreditsModalOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCreditsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-lg glass rounded-[2rem] p-10 shadow-2xl"
                        >
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 rounded-2xl bg-primary/20 text-primary">
                                    <Coins size={32} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-variable-main uppercase tracking-tight">Verificar Créditos</h3>
                                    <p className="text-xs font-bold text-primary uppercase tracking-widest leading-tight">Expediente: {creditsInputData.record?.empresa}</p>
                                </div>
                            </div>

                            <p className="text-sm text-variable-muted mb-8 leading-relaxed font-medium">
                                Para avanzar al siguiente paso, es necesario indicar el importe de los créditos de FUNDAE calculados para esta empresa.
                            </p>

                            <div className="space-y-3 mb-10">
                                <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em] ml-1">Importe de Créditos (€)</label>
                                <div className="relative group">
                                    <input
                                        type="number"
                                        step="0.01"
                                        autoFocus
                                        value={creditsInputData.amount}
                                        onChange={e => setCreditsInputData(prev => ({ ...prev, amount: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && handleSaveAndAdvanceCredits()}
                                        className="w-full bg-white/5 border-2 border-variable rounded-2xl px-6 py-5 focus:outline-none focus:border-primary text-xl font-bold text-variable-main transition-all group-hover:border-primary/30"
                                        placeholder="0.00"
                                    />
                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-variable-muted font-bold text-lg">€</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setIsCreditsModalOpen(false)}
                                    className="py-5 glass rounded-2xl font-black text-[11px] uppercase tracking-[0.15em] text-variable-muted hover:text-variable-main transition-all hover:bg-white/10"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSaveAndAdvanceCredits()}
                                    className="py-5 bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.15em] hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/20"
                                >
                                    Guardar y Avanzar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Factura Modal */}
            <AnimatePresence>
                {facturaModalRecord && (
                    <FacturaModal
                        record={facturaModalRecord}
                        onClose={() => setFacturaModalRecord(null)}
                        onCreated={() => {
                            // El modal ya marca factura_creada=true en BD y ha subido el PDF.
                            // Si el modal de edición está abierto sobre el mismo expediente, reflejamos el cambio en formData.
                            if (editingRecord && editingRecord.id === facturaModalRecord?.id) {
                                setField('factura_creada', true);
                            }
                            fetchRecords();
                        }}
                        showNotification={showNotification}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
