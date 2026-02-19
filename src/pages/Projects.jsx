import React, { useState, useEffect } from 'react';
import {
    FolderOpen,
    Plus,
    Search,
    Filter,
    BarChart3,
    Calendar,
    Users as UsersIcon,
    ArrowRight,
    Edit,
    Trash2,
    CheckCircle2,
    Clock,
    ShieldCheck,
    Type,
    FileText,
    Briefcase,
    X,
    ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export default function Projects() {
    const { darkMode } = useTheme();
    const { profile: currentProfile } = useAuth();
    const { showNotification, confirm } = useNotifications();
    const navigate = useNavigate();
    const { search } = useLocation();
    const query = new URLSearchParams(search);
    const convertLeadId = query.get('convert');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [projectsList, setProjectsList] = useState([]);
    const [leads, setLeads] = useState([]);
    const [users, setUsers] = useState([]);
    const [services, setServices] = useState([]);
    const [fetchError, setFetchError] = useState(null);
    const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
    const [usersDropdownOpen, setUsersDropdownOpen] = useState(false);

    const defaultForm = {
        name: '',
        client: '',
        description: '',
        status: 'En Progreso',
        total_hours: 0,
        id_alias: '',
        lead_id: '',
        assigned_users: [], // Array of user IDs
        selected_services: [] // Array of service IDs
    };
    const [formData, setFormData] = useState(defaultForm);

    const fetchProjects = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*, leads(first_name, last_name, company)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProjectsList(data || []);
        } catch (error) {
            console.error('Error fetching projects:', error);
            setFetchError(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLeads = async () => {
        const { data } = await supabase
            .from('leads')
            .select('id, first_name, last_name, company, service_interest')
            .order('created_at', { ascending: false });
        setLeads(data || []);
        return data || [];
    };

    const fetchUsers = async () => {
        const { data, error } = await supabase
            .from('users')
            .select('id, first_name, second_name, role, status')
            .order('first_name', { ascending: true });

        if (error) console.error("Error fetching users:", error);
        setUsers(data || []);
    };

    const fetchServices = async () => {
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .order('name', { ascending: true });

        if (error) console.error("Error fetching services:", error);
        setServices(data || []);
    };

    useEffect(() => {
        const init = async () => {
            await fetchProjects();
            await fetchUsers();
            await fetchServices();
            const leadsData = await fetchLeads();

            if (convertLeadId) {
                const lead = leadsData.find(l => l.id === convertLeadId);
                if (lead) {
                    const firstInitial = (lead.first_name || '').charAt(0).toUpperCase();
                    const lastInitial = (lead.last_name || '').charAt(0).toUpperCase();
                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    const randomDigits = Math.floor(1000 + Math.random() * 9000);

                    setFormData({
                        ...defaultForm,
                        lead_id: lead.id,
                        name: `Proyecto ${lead.service_interest || ''}`,
                        client: lead.company || `${lead.first_name} ${lead.last_name}`,
                        id_alias: `${firstInitial}${lastInitial}-${dateStr}-${randomDigits}`
                    });
                    setIsModalOpen(true);
                }
            }
        };
        init();

        const channel = supabase
            .channel('projects-db-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'projects' },
                () => fetchProjects()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [convertLeadId]);

    const handleCreateProject = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Prepare data - ensure lead_id is null if empty string
            let finalAlias = formData.id_alias;
            if (!finalAlias) {
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const randomDigits = Math.floor(1000 + Math.random() * 9000);
                finalAlias = `PR-${dateStr}-${randomDigits}`;
            }

            const insertData = {
                ...formData,
                lead_id: formData.lead_id || null,
                id_alias: finalAlias
            };

            // 1. Call RPC function to create project safely
            const { data: projectId, error: rpcError } = await supabase
                .rpc('create_project', {
                    p_name: formData.name,
                    p_client: formData.client,
                    p_description: formData.description || '',
                    p_alias: finalAlias,
                    p_total_hours: parseInt(formData.total_hours) || 0,
                    p_lead_id: formData.lead_id || null,
                    p_assigned_users: formData.assigned_users,
                    p_service_ids: formData.selected_services
                });

            if (rpcError) throw rpcError;

            // 3. Update lead status if applicable

            setFormData(defaultForm);
            setIsModalOpen(false);
            fetchProjects();

            // Clean URL if we were converting
            if (convertLeadId) {
                navigate('/projects', { replace: true });
            }

            showNotification('Proyecto creado con éxito y Lead convertido');
        } catch (err) {
            console.error('Error creating project:', err);
            showNotification(`Error al crear proyecto: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteProject = async (id) => {
        const confirmed = await confirm({
            title: '¿Eliminar Proyecto?',
            message: '¿Estás seguro de que deseas eliminar este proyecto definitivamente? Se borrarán todos los hitos, tareas y archivos asociados.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });

        if (!confirmed) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showNotification('Proyecto eliminado correctamente');
            fetchProjects();
        } catch (err) {
            console.error('Error deleting project:', err);
            showNotification(`Error al eliminar: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight text-variable-main">
                            Gestión de <span className="text-primary italic">Proyectos</span>
                        </h1>
                        <p className="text-variable-muted mt-2 text-sm sm:text-base italic">Supervisa el progreso y recursos de tus activos comerciales</p>
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full sm:w-auto px-6 py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2"
                    >
                        <Plus size={20} />
                        Nuevo Proyecto
                    </button>
                </header>

                <DataTable
                    data={projectsList}
                    loading={loading}
                    emptyMessage="No hay proyectos registrados"
                    columns={[
                        {
                            key: 'name',
                            label: 'Proyecto',
                            render: (project) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                        <FolderOpen size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{project.name}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-bold tracking-widest">{project.id_alias || 'SIN ALIAS'}</p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'client',
                            label: 'Cliente',
                            render: (project) => (
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-variable-main">{project.client}</span>
                                    {project.leads && (
                                        <div className="flex items-center gap-1 mt-1">
                                            <span className="text-[10px] font-bold text-primary uppercase tracking-tighter bg-primary/10 px-1.5 py-0.5 rounded">ORIGEN: LEAD</span>
                                            <span className="text-[10px] text-variable-muted italic truncate max-w-[120px]">
                                                {project.leads.company || `${project.leads.first_name} ${project.leads.last_name}`}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: 'status',
                            label: 'Estado',
                            render: (project) => (
                                <span className={`text-[10px] font-black px-3 py-1 rounded-lg border uppercase ${project.status === 'Completado'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-primary/10 text-primary border-primary/20'
                                    }`}>
                                    {project.status}
                                </span>
                            ),
                        },
                        {
                            key: 'progress',
                            label: 'Progreso',
                            render: (project) => {
                                const prog = project.total_hours > 0 ? (project.actual_hours / project.total_hours) * 100 : 0;
                                return (
                                    <div className="w-32 space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold text-variable-muted uppercase">
                                            <span>{Math.round(prog)}%</span>
                                            <span>{project.actual_hours}/{project.total_hours}h</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/5 border border-variable rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all duration-500"
                                                style={{ width: `${Math.min(prog, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            },
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (project) => (
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => navigate(`/projects/${project.id}`)}
                                        className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-all"
                                        title="Ver Detalles"
                                    >
                                        <ArrowRight size={16} />
                                    </button>
                                    {currentProfile?.role === 'admin' && (
                                        <button
                                            onClick={() => handleDeleteProject(project.id)}
                                            className="p-2 glass rounded-xl text-variable-muted hover:text-rose-500 transition-all"
                                            title="Eliminar Proyecto"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ),
                        }
                    ]}
                />
            </main>

            {/* Modal para Nuevo Proyecto */}
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
                            className="relative w-full max-w-2xl glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
                        >
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-variable-muted hover:text-primary transition-colors z-10">
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2 text-variable-main">Nuevo Proyecto</h2>
                            <p className="text-variable-muted mb-8 italic text-sm sm:text-base">Inicializa un nuevo entorno de trabajo para tu cliente</p>

                            <form onSubmit={handleCreateProject} className="space-y-6">
                                <div className={formData.lead_id ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 gap-6"}>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Nombre del Proyecto</label>
                                        <div className="relative">
                                            <Type className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="Ej: Rediseño Web" />
                                        </div>
                                    </div>
                                    {!formData.lead_id && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Cliente</label>
                                            <div className="relative">
                                                <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                                <input required value={formData.client} onChange={(e) => setFormData({ ...formData, client: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="Empresa o Particular" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Horas Totales Estimadas</label>
                                    <div className="relative">
                                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                        <input type="number" value={formData.total_hours} onChange={(e) => setFormData({ ...formData, total_hours: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="0" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Lead Relacionado (Opcional)</label>
                                    <div className="relative">
                                        <UsersIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                        <select
                                            value={formData.lead_id}
                                            onChange={(e) => {
                                                const leadId = e.target.value;
                                                const selectedLead = leads.find(l => l.id === leadId);

                                                let newAlias = formData.id_alias;
                                                if (selectedLead) {
                                                    const firstInitial = (selectedLead.first_name || '').charAt(0).toUpperCase();
                                                    const lastInitial = (selectedLead.last_name || '').charAt(0).toUpperCase();
                                                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                                                    const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 digitos
                                                    newAlias = `${firstInitial}${lastInitial}-${dateStr}-${randomDigits}`;
                                                }

                                                setFormData({
                                                    ...formData,
                                                    lead_id: leadId,
                                                    client: selectedLead ? (selectedLead.company || `${selectedLead.first_name} ${selectedLead.last_name}`) : formData.client,
                                                    id_alias: newAlias
                                                });
                                            }}
                                            className="w-full bg-[#1a1321] border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base appearance-none"
                                        >
                                            <option value="">-- Seleccionar Lead --</option>
                                            {leads.map(lead => (
                                                <option key={lead.id} value={lead.id}>
                                                    {lead.company ? `${lead.company} (${lead.first_name})` : `${lead.first_name} ${lead.last_name}`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* ── SERVICIOS DROPDOWN ── */}
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1 flex items-center justify-between">
                                        <div className="flex items-center gap-2"><Briefcase size={14} /> Servicios Incluidos</div>
                                        <div className="px-3 py-1 bg-primary/10 rounded-lg text-primary text-[10px] font-black">
                                            TOTAL: €{services
                                                .filter(s => formData.selected_services.includes(s.id))
                                                .reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0)
                                                .toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                        </div>
                                    </label>
                                    <div className="relative">
                                        <button type="button" onClick={() => { setServicesDropdownOpen(!servicesDropdownOpen); setUsersDropdownOpen(false); }} className="w-full flex items-center justify-between bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-muted hover:border-primary/50 transition-all">
                                            <span>{formData.selected_services.length === 0 ? 'Seleccionar servicios...' : `${formData.selected_services.length} servicio(s) seleccionado(s)`}</span>
                                            <ChevronDown size={16} className={`transition-transform ${servicesDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {servicesDropdownOpen && (
                                            <div className="absolute z-50 w-full mt-2 bg-[var(--bg-card,#1a1321)] border border-variable rounded-2xl shadow-2xl max-h-52 overflow-y-auto custom-scrollbar">
                                                {services.length === 0 && <p className="text-[10px] text-variable-muted italic text-center py-4">No hay servicios activos.</p>}
                                                {services.map(service => {
                                                    const isSelected = formData.selected_services.includes(service.id);
                                                    return (
                                                        <div key={service.id} onClick={() => setFormData(prev => ({ ...prev, selected_services: isSelected ? prev.selected_services.filter(id => id !== service.id) : [...prev.selected_services, service.id] }))} className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-white/10 ${isSelected ? 'bg-primary/10' : ''}`}>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary' : 'border-variable'}`}>
                                                                    {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <span className="text-xs font-bold text-variable-main">{service.name}</span>
                                                            </div>
                                                            <span className="text-[10px] text-variable-muted font-bold">€{parseFloat(service.price || 0).toFixed(2)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    {/* Chips de servicios seleccionados */}
                                    {formData.selected_services.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            {services.filter(s => formData.selected_services.includes(s.id)).slice(0, 2).map(s => (
                                                <span key={s.id} className="inline-flex items-center gap-1.5 bg-primary/15 text-primary text-[10px] font-bold px-3 py-1.5 rounded-full">
                                                    {s.name}
                                                    <X size={10} className="cursor-pointer hover:text-red-400 transition-colors" onClick={() => setFormData(prev => ({ ...prev, selected_services: prev.selected_services.filter(id => id !== s.id) }))} />
                                                </span>
                                            ))}
                                            {formData.selected_services.length > 2 && (
                                                <span className="text-[10px] text-variable-muted font-bold bg-white/10 px-2.5 py-1.5 rounded-full">+{formData.selected_services.length - 2} más</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── USUARIOS DROPDOWN ── */}
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                        <UsersIcon size={14} /> Asignar Miembros al Equipo
                                    </label>
                                    <div className="relative">
                                        <button type="button" onClick={() => { setUsersDropdownOpen(!usersDropdownOpen); setServicesDropdownOpen(false); }} className="w-full flex items-center justify-between bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-muted hover:border-primary/50 transition-all">
                                            <span>{formData.assigned_users.length === 0 ? 'Seleccionar miembros...' : `${formData.assigned_users.length} miembro(s) seleccionado(s)`}</span>
                                            <ChevronDown size={16} className={`transition-transform ${usersDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {usersDropdownOpen && (
                                            <div className="absolute z-50 w-full mt-2 bg-[var(--bg-card,#1a1321)] border border-variable rounded-2xl shadow-2xl max-h-52 overflow-y-auto custom-scrollbar">
                                                {users.length === 0 && <p className="text-[10px] text-variable-muted italic text-center py-4">No se encontraron miembros.</p>}
                                                {users.map(user => {
                                                    const isSelected = formData.assigned_users.includes(user.id);
                                                    return (
                                                        <div key={user.id} onClick={() => setFormData(prev => ({ ...prev, assigned_users: isSelected ? prev.assigned_users.filter(id => id !== user.id) : [...prev.assigned_users, user.id] }))} className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-white/10 ${isSelected ? 'bg-primary/10' : ''}`}>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary' : 'border-variable'}`}>
                                                                    {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-bold text-variable-main">{user.first_name} {user.second_name}</span>
                                                                    <span className={`text-[8px] uppercase font-black tracking-widest ${user.role === 'admin' ? 'text-rose-500' : 'text-variable-muted'}`}>{user.role}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    {/* Chips de usuarios seleccionados */}
                                    {formData.assigned_users.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            {users.filter(u => formData.assigned_users.includes(u.id)).slice(0, 2).map(u => (
                                                <span key={u.id} className="inline-flex items-center gap-1.5 bg-primary/15 text-primary text-[10px] font-bold px-3 py-1.5 rounded-full">
                                                    {u.first_name} {u.second_name}
                                                    <X size={10} className="cursor-pointer hover:text-red-400 transition-colors" onClick={() => setFormData(prev => ({ ...prev, assigned_users: prev.assigned_users.filter(id => id !== u.id) }))} />
                                                </span>
                                            ))}
                                            {formData.assigned_users.length > 2 && (
                                                <span className="text-[10px] text-variable-muted font-bold bg-white/10 px-2.5 py-1.5 rounded-full">+{formData.assigned_users.length - 2} más</span>
                                            )}
                                        </div>
                                    )}
                                    <p className="text-[10px] text-variable-muted italic ml-1">* El creador del proyecto se asigna automáticamente como administrador del mismo.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Descripción</label>
                                    <div className="relative">
                                        <FileText className="absolute left-4 top-4 text-variable-muted" size={18} />
                                        <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all h-24 resize-none text-sm" placeholder="Detalles generales del proyecto..." />
                                    </div>
                                </div>

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-4 flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Creando...' : <><ShieldCheck size={20} /> Crear Proyecto</>}
                                </button>
                                <div className="h-4" />
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
