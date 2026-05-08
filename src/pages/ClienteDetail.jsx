import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft,
    Building2,
    Mail,
    Phone,
    MapPin,
    BookOpen,
    FileText,
    Activity,
    Euro,
    Calendar,
    User,
    Hash,
    CreditCard,
    Plus,
    ExternalLink,
    Edit3,
    CheckCircle2,
    Clock,
    AlertCircle,
    Loader2,
    Ban,
    X,
    ShieldCheck,
    GraduationCap,
    Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { buildFundaeSeguimientoPayload } from '../lib/fundae';
import Sidebar from '../components/Sidebar';
import EditClienteModal from '../components/cliente/EditClienteModal';
import FichasFundaeList from '../components/fundae/FichasFundaeList';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

const TABS = [
    { id: 'resumen', label: 'Resumen', icon: User },
    { id: 'facturacion', label: 'Facturación', icon: Euro },
    { id: 'fundae', label: 'FUNDAE', icon: BookOpen },
    { id: 'alumnos', label: 'Alumnos', icon: GraduationCap },
    { id: 'actividad', label: 'Actividad', icon: Activity }
];

const ESTADO_FUNDAE = {
    pendiente: { label: 'Pendiente', icon: Clock, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    en_curso: { label: 'En Curso', icon: Loader2, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    completado: { label: 'Completado', icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    incidencia: { label: 'Incidencia', icon: AlertCircle, color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
    cancelado: { label: 'Cancelado', icon: Ban, color: 'text-gray-500 bg-gray-500/10 border-gray-500/20' }
};

const ESTADO_FACTURA = {
    pendiente: { label: '⏳ Pendiente', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    enviada: { label: '📤 Enviada', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    pagada: { label: '✅ Pagada', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    cancelada: { label: '❌ Cancelada', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' }
};

export default function ClienteDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();

    const [loading, setLoading] = useState(true);
    const [cliente, setCliente] = useState(null);
    const [activeTab, setActiveTab] = useState('resumen');
    const [editOpen, setEditOpen] = useState(false);

    const fetchCliente = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('leads')
                .select(`
                    *,
                    flujos_embudo(status_actual, actividad, tags_proceso, keyword_recibida),
                    segmentacion_despacho(num_comunidades, interes_fundae, software_actual, objetivo_automatizacion),
                    lead_billing(*),
                    fundae_seguimiento(
                        *,
                        fundae_alumnos(*)
                    )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            setCliente(data);
        } catch (err) {
            console.error('Error fetching cliente:', err);
            showNotification(`Error al cargar cliente: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCliente();
        const channel = supabase
            .channel(`cliente-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `id=eq.${id}` }, fetchCliente)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fundae_seguimiento', filter: `lead_id=eq.${id}` }, fetchCliente)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_billing', filter: `lead_id=eq.${id}` }, fetchCliente)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fundae_alumnos' }, fetchCliente)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [id]);

    // Crear nuevo expediente FUNDAE para este cliente
    const handleCrearExpediente = async () => {
        const confirmed = await confirm({
            title: '¿Crear expediente FUNDAE?',
            message: `Se creará un nuevo expediente FUNDAE para ${cliente.empresa_nombre || cliente.nombre}.`,
            confirmText: 'Crear expediente',
            cancelText: 'Cancelar'
        });
        if (!confirmed) return;

        await withLoading(async () => {
            try {
                const payload = await buildFundaeSeguimientoPayload(cliente.id);
                const { error } = await supabase.from('fundae_seguimiento').insert([payload]);
                if (error) throw error;
                showNotification('Expediente FUNDAE creado');
                fetchCliente();
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Creando expediente...');
    };

    // Volver a poner el cliente como lead "en proceso"
    const handleRevertirCliente = async () => {
        const confirmed = await confirm({
            title: '¿Devolver a Leads?',
            message: `${cliente.empresa_nombre || cliente.nombre} dejará de aparecer en Clientes y volverá al pipeline de leads como "En Proceso". Los datos se mantienen intactos.`,
            confirmText: 'Devolver a Leads',
            cancelText: 'Cancelar'
        });
        if (!confirmed) return;

        await withLoading(async () => {
            try {
                const { error } = await supabase
                    .from('flujos_embudo')
                    .update({ status_actual: 'en_proceso' })
                    .eq('lead_id', cliente.id);
                if (error) throw error;
                showNotification('Cliente devuelto a Leads');
                navigate('/clientes');
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Revirtiendo...');
    };

    if (loading || !cliente) {
        return (
            <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    // Verificar que es realmente un cliente (status convertido)
    const status = cliente.flujos_embudo?.[0]?.status_actual;
    if (status !== 'convertido') {
        return (
            <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 p-10 flex items-center justify-center">
                    <div className="text-center max-w-md">
                        <h2 className="text-2xl font-bold text-variable-main mb-3">Este lead no es cliente</h2>
                        <p className="text-variable-muted mb-6">El lead {cliente.nombre} no está marcado como convertido. Conviértelo desde la sección de Leads para verlo aquí.</p>
                        <Link to="/leads" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold">
                            <ArrowLeft size={18} /> Ir a Leads
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    const seg = Array.isArray(cliente.segmentacion_despacho) ? cliente.segmentacion_despacho[0] : cliente.segmentacion_despacho;
    const billing = Array.isArray(cliente.lead_billing) ? cliente.lead_billing : (cliente.lead_billing ? [cliente.lead_billing] : []);
    const expedientes = cliente.fundae_seguimiento || [];
    const flujo = cliente.flujos_embudo?.[0] || {};

    const totalFacturado = billing.reduce((s, b) => s + (parseFloat(b.importe_factura) || 0), 0);
    const totalPagadas = billing.filter(b => b.estado_factura === 'pagada').reduce((s, b) => s + (parseFloat(b.importe_factura) || 0), 0);
    const fundaeCompletados = expedientes.filter(e => e.estado === 'completado').length;

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                {/* Back link */}
                <button
                    onClick={() => navigate('/clientes')}
                    className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest mb-6"
                >
                    <ArrowLeft size={14} /> Clientes
                </button>

                {/* Header con datos principales */}
                <header className="glass rounded-[2rem] p-6 sm:p-8 mb-6 border border-variable">
                    <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
                        <div className="flex items-start gap-5 min-w-0 flex-1">
                            <div className="size-16 sm:size-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-xl sm:text-2xl flex-shrink-0">
                                {(cliente.empresa_nombre || cliente.nombre || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                    <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-variable-main truncate">
                                        {cliente.empresa_nombre || cliente.nombre}
                                    </h1>
                                    <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                                        Cliente
                                    </span>
                                    {flujo.actividad === 'lead_activo' && (
                                        <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-[9px] font-bold uppercase tracking-widest border border-emerald-500/20">
                                            ● Activo
                                        </span>
                                    )}
                                    {flujo.actividad === 'lead_inactivo' && (
                                        <span className="px-2 py-1 rounded-md bg-rose-500/10 text-rose-500 text-[9px] font-bold uppercase tracking-widest border border-rose-500/20">
                                            ● Inactivo
                                        </span>
                                    )}
                                </div>
                                <p className="text-variable-muted text-sm">
                                    Contacto: <span className="text-variable-main font-bold">{cliente.nombre}</span>
                                </p>
                                <div className="flex flex-wrap gap-4 mt-3 text-xs text-variable-muted">
                                    {cliente.email && (
                                        <a href={`mailto:${cliente.email}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                                            <Mail size={12} /> {cliente.email}
                                        </a>
                                    )}
                                    {cliente.whatsapp && (
                                        <a href={`tel:${cliente.whatsapp}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                                            <Phone size={12} /> {cliente.whatsapp}
                                        </a>
                                    )}
                                    {cliente.ciudad && (
                                        <span className="flex items-center gap-1.5">
                                            <MapPin size={12} /> {cliente.ciudad}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                            <button
                                onClick={() => setEditOpen(true)}
                                className="px-4 py-3 glass rounded-2xl text-xs font-bold text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                                title="Editar datos del cliente"
                            >
                                <Edit3 size={14} /> Editar cliente
                            </button>
                            <button
                                onClick={handleRevertirCliente}
                                className="px-4 py-3 glass rounded-2xl text-xs font-bold text-variable-muted hover:text-rose-500 transition-all"
                                title="Volver a marcar como lead en proceso"
                            >
                                Devolver a Leads
                            </button>
                        </div>
                    </div>
                </header>

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                        { label: 'Facturado', value: `${Number(totalFacturado).toLocaleString('es-ES')} €`, icon: Euro, color: 'text-primary' },
                        { label: 'Cobrado', value: `${Number(totalPagadas).toLocaleString('es-ES')} €`, icon: CheckCircle2, color: 'text-emerald-500' },
                        { label: 'Expedientes FUNDAE', value: expedientes.length, icon: BookOpen, color: 'text-blue-500' },
                        { label: 'FUNDAE completados', value: fundaeCompletados, icon: ShieldCheck, color: 'text-emerald-500' }
                    ].map((kpi, i) => (
                        <div key={i} className="glass rounded-2xl p-4 flex items-center gap-3">
                            <kpi.icon size={20} className={kpi.color} />
                            <div>
                                <p className="text-xl font-black text-variable-main">{kpi.value}</p>
                                <p className="text-[10px] text-variable-muted uppercase font-bold tracking-widest">{kpi.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-6 bg-white/5 p-1.5 rounded-[1.5rem] border border-variable w-fit">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'text-variable-muted hover:text-variable-main'}`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <AnimatePresence mode="wait">
                    {activeTab === 'resumen' && (
                        <motion.div key="resumen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Datos del cliente — lead_billing manda, lead como fallback */}
                            {(() => {
                                const lb = (Array.isArray(cliente.lead_billing) ? cliente.lead_billing[0] : cliente.lead_billing) || {};
                                const datos = {
                                    razon_social: lb.razon_social || cliente.razon_social || cliente.empresa_nombre,
                                    cif: lb.cif || cliente.cif || cliente.cif_nif,
                                    direccion: lb.direccion_facturacion || cliente.direccion,
                                    ciudad: lb.poblacion || cliente.ciudad,
                                    provincia: lb.provincia || cliente.provincia,
                                    codigo_postal: lb.codigo_postal || cliente.codigo_postal
                                };
                                return (
                                    <div className="glass rounded-[1.5rem] p-6">
                                        <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
                                            <Building2 size={16} /> Datos del Cliente
                                        </h3>
                                        <dl className="space-y-3">
                                            <Field label="Razón Social" value={datos.razon_social} />
                                            <Field label="CIF / NIF" value={datos.cif} mono />
                                            <Field label="Dirección" value={datos.direccion} />
                                            <div className="grid grid-cols-2 gap-3">
                                                <Field label="Ciudad" value={datos.ciudad} />
                                                <Field label="Provincia" value={datos.provincia} />
                                            </div>
                                            <Field label="Código Postal" value={datos.codigo_postal} mono />
                                        </dl>
                                    </div>
                                );
                            })()}

                            {/* Segmentación */}
                            <div className="glass rounded-[1.5rem] p-6">
                                <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
                                    <Hash size={16} /> Segmentación del Despacho
                                </h3>
                                <dl className="space-y-3">
                                    <Field label="Nº Comunidades" value={seg?.num_comunidades} />
                                    <Field label="Software Actual" value={seg?.software_actual} />
                                    <Field label="Objetivo Automatización" value={seg?.objetivo_automatizacion} />
                                    <div>
                                        <dt className="text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">Interés FUNDAE</dt>
                                        <dd>
                                            {seg?.interes_fundae ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-widest border border-emerald-500/20">
                                                    <CheckCircle2 size={12} /> Sí
                                                </span>
                                            ) : (
                                                <span className="text-variable-muted text-sm">No</span>
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            {/* Origen */}
                            <div className="glass rounded-[1.5rem] p-6 lg:col-span-2">
                                <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
                                    <Calendar size={16} /> Origen y Captación
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                    <Field label="Fuente" value={cliente.source || 'Landing Page'} />
                                    <Field label="Fecha de Captación" value={new Date(cliente.fecha_creacion).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} />
                                    <Field label="Keyword Recibida" value={flujo.keyword_recibida} />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'facturacion' && (
                        <motion.div key="facturacion" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                            {/* Datos exclusivos de facturación (los datos generales están en Resumen) */}
                            <div className="glass rounded-[1.5rem] p-6">
                                <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
                                    <CreditCard size={16} /> Datos de Cobro
                                </h3>
                                {(() => {
                                    const lb = billing[0] || {};
                                    const datos = {
                                        email_facturacion: lb.email_facturacion || cliente.email,
                                        metodo_pago: lb.metodo_pago,
                                        iban: lb.iban
                                    };
                                    return (
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                            <Field label="Email facturación" value={datos.email_facturacion} />
                                            <Field label="Método de pago" value={datos.metodo_pago} />
                                            <Field label="IBAN" value={datos.iban} mono />
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Histórico de facturas */}
                            <div className="glass rounded-[1.5rem] p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <Euro size={16} /> Histórico de Facturas
                                    </h3>
                                </div>
                                {billing.filter(b => b.numero_factura || parseFloat(b.importe_factura) > 0).length === 0 ? (
                                    <p className="text-variable-muted text-sm">Aún no hay facturas registradas. Edita el cliente desde Leads para añadir.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="text-[10px] uppercase tracking-widest text-variable-muted font-bold border-b border-variable">
                                                <tr>
                                                    <th className="pb-3">Nº Factura</th>
                                                    <th className="pb-3">Importe</th>
                                                    <th className="pb-3">Estado</th>
                                                    <th className="pb-3">Notas</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-variable">
                                                {billing.map((b, i) => {
                                                    const cfg = ESTADO_FACTURA[b.estado_factura] || ESTADO_FACTURA.pendiente;
                                                    return (
                                                        <tr key={b.id || i} className="text-sm">
                                                            <td className="py-3 font-mono text-variable-main">{b.numero_factura || '—'}</td>
                                                            <td className="py-3 font-bold text-primary">
                                                                {b.importe_factura ? `${Number(b.importe_factura).toLocaleString('es-ES')} €` : '—'}
                                                            </td>
                                                            <td className="py-3">
                                                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${cfg.color}`}>
                                                                    {cfg.label}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 text-variable-muted text-xs italic max-w-xs truncate">{b.notas_factura || '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'fundae' && (
                        <motion.div key="fundae" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                    <BookOpen size={16} /> Expedientes FUNDAE ({expedientes.length})
                                </h3>
                                <button
                                    onClick={handleCrearExpediente}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl font-bold text-xs hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                                >
                                    <Plus size={14} /> Nuevo expediente
                                </button>
                            </div>

                            {expedientes.length === 0 ? (
                                <div className="glass rounded-[1.5rem] p-10 text-center">
                                    <BookOpen size={32} className="mx-auto mb-3 text-variable-muted opacity-40" />
                                    <p className="text-variable-muted text-sm mb-4">Este cliente no tiene expedientes FUNDAE.</p>
                                    <button
                                        onClick={handleCrearExpediente}
                                        className="inline-flex items-center gap-2 px-5 py-3 glass rounded-2xl text-primary font-bold text-xs"
                                    >
                                        <Plus size={14} /> Crear primer expediente
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {expedientes.map(exp => {
                                        const cfg = ESTADO_FUNDAE[exp.estado] || ESTADO_FUNDAE.pendiente;
                                        const Icon = cfg.icon;
                                        return (
                                            <Link
                                                key={exp.id}
                                                to="/fundae"
                                                className="glass rounded-[1.5rem] p-5 hover:border-primary/30 border border-variable transition-all group"
                                            >
                                                <div className="flex items-start justify-between mb-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${cfg.color}`}>
                                                        <Icon size={12} /> {cfg.label}
                                                    </span>
                                                    <ExternalLink size={14} className="text-variable-muted group-hover:text-primary transition-colors" />
                                                </div>
                                                <p className="font-bold text-variable-main mb-1">{exp.empresa}</p>
                                                <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest mb-4">
                                                    {new Date(exp.fecha_inicio).toLocaleDateString('es-ES')}
                                                </p>
                                                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-variable">
                                                    <Stat label="Créditos" value={exp.creditos_fundae > 0 ? `${Number(exp.creditos_fundae).toLocaleString('es-ES')}€` : '—'} />
                                                    <Stat label="Facturado" value={exp.facturado > 0 ? `${Number(exp.facturado).toLocaleString('es-ES')}€` : '—'} />
                                                    <Stat label="Pagado" value={exp.pagado > 0 ? `${Number(exp.pagado).toLocaleString('es-ES')}€` : '—'} />
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'alumnos' && (
                        <motion.div key="alumnos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                            {(() => {
                                const fichas = (cliente.fundae_seguimiento || []).flatMap(fs =>
                                    (fs.fundae_alumnos || []).map(fa => ({ ...fa, expediente: fs }))
                                );
                                return (
                                    <div className="glass rounded-[1.5rem] p-6">
                                        <div className="flex items-center justify-between mb-5">
                                            <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                                <GraduationCap size={16} /> Fichas de alumnos ({fichas.length})
                                            </h3>
                                        </div>
                                        <FichasFundaeList
                                            fichas={fichas}
                                            onRefresh={fetchCliente}
                                            showNotification={showNotification}
                                        />
                                    </div>
                                );
                            })()}
                        </motion.div>
                    )}

                    {activeTab === 'actividad' && (
                        <motion.div key="actividad" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass rounded-[1.5rem] p-6">
                            <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
                                <Activity size={16} /> Actividad y Embudo
                            </h3>
                            <div className="space-y-4">
                                <Field label="Estado actual" value={
                                    <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-widest border border-emerald-500/20">
                                        Convertido
                                    </span>
                                } />
                                <Field label="Actividad" value={flujo.actividad === 'lead_activo' ? 'Activo' : flujo.actividad === 'lead_inactivo' ? 'Inactivo' : '—'} />
                                <div>
                                    <dt className="text-[10px] font-black uppercase tracking-widest text-variable-muted mb-2">Histórico de Tags del Embudo</dt>
                                    <dd>
                                        {(flujo.tags_proceso || []).length === 0 ? (
                                            <span className="text-variable-muted text-sm">Sin tags registrados.</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {(flujo.tags_proceso || []).map((tag, i) => (
                                                    <span key={i} className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest border border-primary/20">
                                                        {String(tag).replace(/_/g, ' ')}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </dd>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {editOpen && cliente && (
                        <EditClienteModal
                            cliente={cliente}
                            onClose={() => setEditOpen(false)}
                            onSaved={fetchCliente}
                            showNotification={showNotification}
                        />
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}

function Field({ label, value, mono = false }) {
    return (
        <div>
            <dt className="text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">{label}</dt>
            <dd className={`text-variable-main text-sm ${mono ? 'font-mono tracking-wider' : ''}`}>
                {value || <span className="text-variable-muted italic">No registrado</span>}
            </dd>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-variable-muted mb-0.5">{label}</p>
            <p className="text-sm font-bold text-variable-main">{value}</p>
        </div>
    );
}
