import React, { useState, useEffect } from 'react';
import {
    Users as UsersIcon,
    UserPlus,
    Search,
    Clock,
    Sun,
    Moon,
    X,
    ShieldCheck,
    Mail,
    Phone,
    MapPin,
    Briefcase,
    Globe,
    Target,
    Filter,
    FileDown,
    Trash2,
    Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

export default function Leads() {
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [leadsList, setLeadsList] = useState([]);
    const [activeTab, setActiveTab] = useState('todos');
    const [fetchError, setFetchError] = useState(null);
    const [editingLead, setEditingLead] = useState(null);

    const tabs = [
        { id: 'todos', label: 'Todos' },
        { id: 'nuevo', label: 'Nuevos' },
        { id: 'en_proceso', label: 'En Proceso' },
        { id: 'contactado', label: 'Contactados' },
        { id: 'convertido', label: 'Convertidos' },
        { id: 'perdido', label: 'Perdidos' }
    ];

    const fetchLeads = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            // Unimos con flujos_embudo y segmentacion_despacho si existen
            const { data, error } = await supabase
                .from('leads')
                .select(`
                    *,
                    flujos_embudo(status_actual, keyword_recibida, tags_proceso, actividad),
                    segmentacion_despacho(num_comunidades, interes_fundae, software_actual, objetivo_automatizacion)
                `)
                .order('fecha_creacion', { ascending: false });

            if (error) throw error;
            setLeadsList(data || []);
        } catch (error) {
            console.error('Error fetching leads:', error);
            setFetchError(error);
        } finally {
            setLoading(false);
        }
    };

    const stats = {
        todos: leadsList.length,
        nuevo: leadsList.filter(l => (l.flujos_embudo?.[0]?.status_actual || 'nuevo') === 'nuevo').length,
        contactado: leadsList.filter(l => l.flujos_embudo?.[0]?.status_actual === 'contactado').length,
        en_proceso: leadsList.filter(l => l.flujos_embudo?.[0]?.status_actual === 'en_proceso').length,
        convertido: leadsList.filter(l => l.flujos_embudo?.[0]?.status_actual === 'convertido').length,
        perdido: leadsList.filter(l => l.flujos_embudo?.[0]?.status_actual === 'perdido').length
    };

    const filteredLeads = activeTab === 'todos'
        ? leadsList
        : leadsList.filter(l => (l.flujos_embudo?.[0]?.status_actual || 'nuevo') === activeTab);

    const defaultForm = {
        nombre: '',
        email: '',
        whatsapp: '',
        empresa_nombre: '',
        ciudad: '',
        source: 'Landing Page'
    };
    const [formData, setFormData] = useState(defaultForm);

    const handleCreateLead = async (e) => {
        e.preventDefault();
        setLoading(true);
        await withLoading(async () => {
            try {
                const { data: newLead, error } = await supabase
                    .from('leads')
                    .insert([formData])
                    .select()
                    .single();

                if (error) throw error;

                // Crear entrada inicial en flujos_embudo
                await supabase.from('flujos_embudo').insert([{
                    lead_id: newLead.id,
                    status_actual: 'nuevo'
                }]);

                setFormData(defaultForm);
                setIsModalOpen(false);
                showNotification('Lead creado con éxito');
                fetchLeads();
            } catch (err) {
                console.error('Error creating lead:', err);
                showNotification(`Error al crear lead: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }, 'Creando nuevo lead...');
    };

    const handleUpdateLead = async (e) => {
        e.preventDefault();
        setLoading(true);
        await withLoading(async () => {
            try {
                const { error: leadError } = await supabase
                    .from('leads')
                    .update({
                        nombre: formData.nombre,
                        email: formData.email,
                        whatsapp: formData.whatsapp,
                        empresa_nombre: formData.empresa_nombre,
                        ciudad: formData.ciudad
                    })
                    .eq('id', editingLead.id);

                if (leadError) throw leadError;

                // Update tags in flujos_embudo
                const { data: currentFlujo } = await supabase
                    .from('flujos_embudo')
                    .select('tags_proceso')
                    .eq('lead_id', editingLead.id)
                    .single();

                const oldTags = currentFlujo?.tags_proceso || [];

                // Construct new tags array: Keep the history, adding new valid tags
                let newTags = [...oldTags];

                // Add new process tag if selected and it's not the current last process tag
                const lastProcessTag = oldTags.length > 0 ? oldTags[oldTags.length - 1] : null;

                if (formData.newTag && lastProcessTag !== formData.newTag) {
                    newTags.push(formData.newTag);
                }

                const newActivity = formData.newActivity || null;

                await supabase
                    .from('flujos_embudo')
                    .update({
                        tags_proceso: newTags,
                        actividad: newActivity === 'null' ? null : newActivity
                    })
                    .eq('lead_id', editingLead.id);

                setIsModalOpen(false);
                setEditingLead(null);
                setFormData(defaultForm);
                showNotification('Lead actualizado con éxito');
                fetchLeads();
            } catch (err) {
                console.error('Error updating lead:', err);
                showNotification(`Error: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }, 'Actualizando lead...');
    };

    const openEditModal = (lead) => {
        setEditingLead(lead);
        const tags = lead.flujos_embudo?.[0]?.tags_proceso || [];
        const currentActivity = lead.flujos_embudo?.[0]?.actividad || '';

        setFormData({
            nombre: lead.nombre,
            email: lead.email,
            whatsapp: lead.whatsapp || '',
            empresa_nombre: lead.empresa_nombre || '',
            ciudad: lead.ciudad || '',
            newTag: tags.length > 0 ? tags[tags.length - 1] : '',
            newActivity: currentActivity
        });
        setIsModalOpen(true);
    };

    const handleDeleteLead = async (lead) => {
        const confirmed = await confirm({
            title: '¿Eliminar Lead?',
            message: `¿Estás seguro de que deseas eliminar a ${lead.nombre}? Esta acción no se puede deshacer.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });

        if (confirmed) {
            await withLoading(async () => {
                try {
                    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
                    if (error) throw error;
                    showNotification('Lead eliminado correctamente');
                    fetchLeads();
                } catch (err) {
                    showNotification(`Error: ${err.message}`, 'error');
                }
            }, 'Eliminando lead...');
        }
    };

    useEffect(() => {
        fetchLeads();
        const channel = supabase
            .channel('leads-all-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads())
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Lead Management</h1>
                        <p className="text-variable-muted">Gestión de prospectos para AFCademIA</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        <button onClick={fetchLeads} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            <Clock size={20} />
                        </button>
                        <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button onClick={() => setIsModalOpen(true)} className="flex-1 sm:flex-none bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                            <UserPlus size={20} /> <span>Nuevo Lead</span>
                        </button>
                    </div>
                </header>

                <div className="flex flex-wrap gap-2 mb-8 bg-white/5 p-1.5 rounded-[1.5rem] border border-variable w-fit">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === tab.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'text-variable-muted hover:text-variable-main'
                                }`}
                        >
                            {tab.label}
                            <span className="px-2 py-0.5 rounded-md bg-black/10 text-[9px]">
                                {stats[tab.id]}
                            </span>
                        </button>
                    ))}
                </div>

                <DataTable
                    tableId="leads"
                    loading={loading}
                    data={filteredLeads}
                    rowKey="id"
                    columns={[
                        {
                            key: 'nombre',
                            label: 'Lead',
                            render: (lead) => (
                                <div>
                                    <p className="font-bold text-variable-main">{lead.nombre}</p>
                                    <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{lead.email}</p>
                                </div>
                            )
                        },
                        {
                            key: 'whatsapp',
                            label: 'WhatsApp',
                            render: (lead) => <span className="text-variable-muted text-sm">{lead.whatsapp || '—'}</span>
                        },
                        {
                            key: 'empresa_nombre',
                            label: 'Empresa',
                            render: (lead) => <span className="text-variable-muted text-sm">{lead.empresa_nombre || '—'}</span>
                        },
                        {
                            key: 'ciudad',
                            label: 'Ciudad',
                            render: (lead) => <span className="text-variable-muted text-sm">{lead.ciudad || '—'}</span>
                        },
                        {
                            key: 'segmentacion',
                            label: 'Comunidades',
                            render: (lead) => (
                                <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold">
                                    {lead.segmentacion_despacho?.num_comunidades || '—'}
                                </span>
                            )
                        },
                        {
                            key: 'actividad',
                            label: 'Actividad',
                            align: 'center',
                            render: (lead) => {
                                const actividad = lead.flujos_embudo?.[0]?.actividad;

                                if (!actividad) return <span className="text-variable-muted text-[10px]">—</span>;

                                let tagStyles = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                                if (actividad === 'lead_inactivo') tagStyles = 'bg-rose-500/10 text-rose-500 border-rose-500/20';

                                return (
                                    <div className="flex justify-center">
                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${tagStyles}`}>
                                            {actividad === 'lead_activo' ? 'ACTIVO' : 'INACTIVO'}
                                        </span>
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'tags',
                            label: 'Tags Proceso',
                            render: (lead) => {
                                const tags = lead.flujos_embudo?.[0]?.tags_proceso || [];
                                const lastTag = tags.length > 0 ? tags[tags.length - 1] : null;

                                if (!lastTag) return <span className="text-variable-muted text-[10px]">—</span>;

                                return (
                                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider border border-primary/20">
                                            {lastTag.replace('_', ' ')}
                                        </span>
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'status',
                            label: 'Estado',
                            render: (lead) => {
                                const status = lead.flujos_embudo?.[0]?.status_actual || 'nuevo';
                                const colors = {
                                    nuevo: 'bg-blue-500/10 text-blue-500',
                                    en_proceso: 'bg-amber-500/10 text-amber-500',
                                    convertido: 'bg-emerald-500/10 text-emerald-500',
                                    perdido: 'bg-rose-500/10 text-rose-500',
                                    contactado: 'bg-indigo-500/10 text-indigo-500'
                                };
                                return (
                                    <span className={`px-3 py-1 rounded-lg text-[10px] uppercase font-black border border-current ${colors[status]}`}>
                                        {status.replace('_', ' ')}
                                    </span>
                                );
                            }
                        },
                        {
                            key: 'fecha_creacion',
                            label: 'Fecha',
                            render: (lead) => (
                                <span className="text-variable-muted text-sm">
                                    {new Date(lead.fecha_creacion).toLocaleDateString('es-ES')}
                                </span>
                            )
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (lead) => (
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => openEditModal(lead)} className="p-2 glass rounded-xl text-variable-muted hover:text-primary"><Edit3 size={16} /></button>
                                    <button onClick={() => handleDeleteLead(lead)} className="p-2 glass rounded-xl text-variable-muted hover:text-rose-500"><Trash2 size={16} /></button>
                                </div>
                            )
                        }
                    ]}
                />
            </main>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-xl glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl">
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-8 right-8 text-variable-muted hover:text-primary transition-colors"><X size={24} /></button>
                            <h2 className="text-3xl font-bold font-display mb-8 text-variable-main">
                                {editingLead ? 'Editar Lead' : 'Nuevo Lead'}
                            </h2>
                            <form onSubmit={editingLead ? handleUpdateLead : handleCreateLead} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre Completo</label>
                                    <input required value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Ej: Juan Pérez" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email</label>
                                        <input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="email@ejemplo.com" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">WhatsApp</label>
                                        <input value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="+34 600 000 000" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Empresa</label>
                                        <input value={formData.empresa_nombre} onChange={(e) => setFormData({ ...formData, empresa_nombre: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Nombre Despacho" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Ciudad</label>
                                        <input value={formData.ciudad} onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Ej: Madrid" />
                                    </div>
                                </div>
                                {editingLead && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Tag Proceso / Estado</label>
                                            <select
                                                value={formData.newTag || ''}
                                                onChange={(e) => setFormData({ ...formData, newTag: e.target.value })}
                                                className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled className="bg-[#003865]">Seleccionar Tag...</option>
                                                <option value="nuevo" className="bg-[#003865]">NUEVO</option>
                                                <option value="email_enviado" className="bg-[#003865]">EMAIL ENVIADO</option>
                                                <option value="respondido" className="bg-[#003865]">RESPONDIDO</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Actividad</label>
                                            <select
                                                value={formData.newActivity || ''}
                                                onChange={(e) => setFormData({ ...formData, newActivity: e.target.value })}
                                                className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="" className="bg-[#003865]">Ninguna</option>
                                                <option value="lead_activo" className="bg-[#003865] text-emerald-500 font-bold">● LEAD ACTIVO</option>
                                                <option value="lead_inactivo" className="bg-[#003865] text-rose-500 font-bold">● LEAD INACTIVO</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <button disabled={loading} type="submit" className="w-full py-5 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-4 flex items-center justify-center gap-2">
                                    {loading ? (editingLead ? 'Actualizando...' : 'Creando...') : <><ShieldCheck size={20} /> {editingLead ? 'Actualizar Lead' : 'Guardar Lead'}</>}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
