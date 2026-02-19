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
    Briefcase,
    MessageSquare,
    Star,
    Target,
    Rocket
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import CustomSelect from '../components/CustomSelect';
import DataTable from '../components/DataTable';
import { useAuth } from '../context/AuthContext';

export default function Leads() {
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();
    const { profile: currentProfile } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [leadsList, setLeadsList] = useState([]);
    const [services, setServices] = useState([]);
    const [fetchError, setFetchError] = useState(null);

    const defaultForm = {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        client_type: 'particular',
        service_interest: 'automatizacion',
        message: '',
        source: 'Panel Administrativo',
        score: 0,
        privacy_accepted: false
    };
    const [formData, setFormData] = useState(defaultForm);

    const clientTypes = [
        { value: 'particular', label: 'Particular' },
        { value: 'empresa', label: 'Empresa' },
        { value: 'agencia', label: 'Agencia' },
        { value: 'otro', label: 'Otro' }
    ];

    const fetchServices = async () => {
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching services in leads:', {
                message: error.message,
                details: error.details,
                hint: error.hint
            });
        } else if (data) {
            setServices(data || []);
        }
    };

    const serviceInterests = services.map(s => ({
        value: s.name,
        label: s.name
    }));

    // If no services yet, provide some defaults or empty list
    const finalServiceInterests = serviceInterests.length > 0
        ? serviceInterests
        : [{ value: 'otro', label: 'Otro' }];

    const fetchLeads = async () => {
        setFetchError(null);
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching leads:', error);
            setFetchError(error);
        } else if (data) {
            setLeadsList(data);
        }
        setLoading(false);
    };

    const handleCreateLead = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('leads')
                .insert([formData]);

            if (error) throw error;

            setFormData(defaultForm);
            setIsModalOpen(false);
            fetchLeads();
        } catch (err) {
            console.error('Error creating lead:', err);
            alert(`Error al crear lead: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeads();
        fetchServices();

        const leadsChannel = supabase
            .channel('leads-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
                fetchLeads();
            })
            .subscribe();

        const servicesChannel = supabase
            .channel('services-leads-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
                fetchServices();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(leadsChannel);
            supabase.removeChannel(servicesChannel);
        };
    }, []);

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Gestión de Leads</h1>
                        <p className="text-variable-muted">Administra los prospectos y oportunidades comerciales</p>
                        {fetchError && (
                            <div className="text-xs text-rose-500 mt-2 font-mono">
                                Error DB: {fetchError.message}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        <button
                            onClick={fetchLeads}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center justify-center"
                            title="Recargar Lista"
                        >
                            <Clock size={20} />
                        </button>
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center justify-center"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1 sm:flex-none bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                        >
                            <UserPlus size={20} /> <span className="whitespace-nowrap">Nuevo Lead</span>
                        </button>
                    </div>
                </header>

                <DataTable
                    tableId="leads"
                    loading={loading}
                    data={leadsList}
                    rowKey="id"
                    defaultSort={{ key: 'created_at', dir: 'desc' }}
                    emptyIcon={<UsersIcon size={40} className="opacity-20" />}
                    emptyTitle="No se encontraron leads en la base de datos"
                    emptySub="Los leads aparecerán aquí cuando se registren o importen"
                    columns={[
                        {
                            key: 'first_name',
                            label: 'Lead',
                            hideable: false,
                            render: (lead) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                        {lead.first_name[0]}{lead.last_name[0]}
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{lead.first_name} {lead.last_name}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{lead.email}</p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'phone',
                            label: 'Teléfono',
                            render: (lead) => <span className="text-variable-muted text-sm">{lead.phone || '—'}</span>,
                        },
                        {
                            key: 'client_type',
                            label: 'Tipo',
                            render: (lead) => (
                                <span className="px-3 py-1 rounded-lg bg-white/5 border border-variable text-[10px] uppercase font-black text-variable-muted">
                                    {lead.client_type}
                                </span>
                            ),
                        },
                        {
                            key: 'service_interest',
                            label: 'Interés',
                            render: (lead) => (
                                <span className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[10px] uppercase font-black text-primary">
                                    {lead.service_interest}
                                </span>
                            ),
                        },
                        {
                            key: 'score',
                            label: 'Calidad',
                            align: 'center',
                            render: (lead) => (
                                <div className="flex gap-1 justify-center">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={12} className={i < (lead.score || 0) ? 'fill-primary text-primary' : 'text-white/10'} />
                                    ))}
                                </div>
                            ),
                        },
                        {
                            key: 'status',
                            label: 'Estado',
                            render: (lead) => (
                                <span className={`px-3 py-1 rounded-lg text-[10px] uppercase font-black border ${lead.status === 'ganado'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : lead.status === 'perdido'
                                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                        : 'bg-primary/10 text-primary border-primary/20'
                                    }`}>
                                    {lead.status || 'pendiente'}
                                </span>
                            ),
                        },
                        {
                            key: 'created_at',
                            label: 'Fecha',
                            render: (lead) => (
                                <span className="text-variable-muted text-sm">
                                    {new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                </span>
                            ),
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (lead) => (
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => navigate(`/projects?convert=${lead.id}`)}
                                        className="p-2 glass rounded-xl text-primary hover:bg-primary/10 transition-all flex items-center gap-2 pr-4 shadow-lg shadow-primary/5"
                                        title="Convertir a Proyecto"
                                    >
                                        <div className="bg-primary/20 p-1 rounded-lg"><Rocket size={14} /></div>
                                        <span className="text-[10px] font-black uppercase tracking-tighter">Convertir</span>
                                    </button>
                                </div>
                            ),
                        }
                    ]}
                />
            </main>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl glass rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 min-h-[600px] shadow-2xl flex flex-col overflow-visible"
                        >
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-variable-muted hover:text-primary transition-colors z-10">
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2 text-variable-main">Nuevo Lead</h2>
                            <p className="text-variable-muted mb-8 italic text-sm sm:text-base">Introduce los detalles del nuevo prospecto comercial</p>

                            <form onSubmit={handleCreateLead} className="space-y-5">
                                <p className="text-xs font-black text-primary uppercase tracking-[0.2em] border-b border-variable pb-2">Información de Contacto</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre</label>
                                        <input required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="Nombre" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Apellidos</label>
                                        <input required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="Apellidos" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="email@ejemplo.com" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Teléfono</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="600 000 000" />
                                        </div>
                                    </div>
                                </div>

                                <p className="text-xs font-black text-primary uppercase tracking-[0.2em] border-b border-variable pb-2 pt-2">Perfil y Calificación</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Tipo de Cliente</label>
                                        <CustomSelect
                                            value={formData.client_type}
                                            onChange={(val) => setFormData({ ...formData, client_type: val })}
                                            icon={Target}
                                            options={clientTypes}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Interés</label>
                                        <CustomSelect
                                            value={formData.service_interest}
                                            onChange={(val) => setFormData({ ...formData, service_interest: val })}
                                            icon={Briefcase}
                                            options={finalServiceInterests}
                                        />
                                    </div>
                                </div>

                                {/* Removed Score and Message fields for administrative creation */}

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-8 flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Procesando...' : <><ShieldCheck size={20} /> Crear Lead</>}
                                </button>
                                <div className="h-10" /> {/* Extra bottom spacing */}
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
