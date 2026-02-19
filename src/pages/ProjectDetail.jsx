import React, { useState, useEffect } from 'react';
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Clock,
    Download,
    FileText,
    Share2,
    Edit3,
    BarChart3,
    MoreVertical,
    LayoutDashboard,
    Users as UsersIcon,
    FolderOpen,
    Settings,
    Sun,
    Moon,
    Plus,
    X,
    ShieldCheck,
    Briefcase,
    Target,
    Trash2,
    Receipt,
    ChevronDown,
    ChevronUp,
    DollarSign,
    Percent
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();
    const { profile: currentProfile } = useAuth();
    const { showNotification } = useNotifications();

    const [project, setProject] = useState(null);
    const [milestones, setMilestones] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modals state
    const [milestoneModal, setMilestoneModal] = useState(false);
    const [taskModal, setTaskModal] = useState(false);

    // State for creating items
    const [newMilestone, setNewMilestone] = useState({ title: '', target_date: '', status: 'pending' });
    const [newTask, setNewTask] = useState({ title: '', priority: 'Media', assigned_to: '' });
    const [users, setUsers] = useState([]);
    const [formLoading, setFormLoading] = useState(false);

    // Budget / Services state
    const [projectServices, setProjectServices] = useState([]);
    const [budgetLines, setBudgetLines] = useState([]);
    const [budgetExpanded, setBudgetExpanded] = useState(true);
    const [budgetLineModal, setBudgetLineModal] = useState(false);
    const [newBudgetLine, setNewBudgetLine] = useState({ description: '', unit_price: '', quantity: 1, iva_percent: 21 });

    const fetchProjectData = async () => {
        try {
            setLoading(true);

            // Fetch project
            const { data: proj, error: projErr } = await supabase
                .from('projects')
                .select('*, leads(*)')
                .eq('id', id)
                .single();
            if (projErr) throw projErr;
            setProject(proj);

            // Fetch milestones
            const { data: miles, error: milesErr } = await supabase
                .from('project_milestones')
                .select('*')
                .eq('project_id', id)
                .order('target_date', { ascending: true });
            if (milesErr) throw milesErr;
            setMilestones(miles);

            // Fetch tasks (Top priority 10)
            const { data: tks, error: tksErr } = await supabase
                .from('project_tasks')
                .select('*')
                .eq('project_id', id)
                .order('created_at', { ascending: false });
            if (tksErr) throw tksErr;
            setTasks(tks);

            // Fetch files
            const { data: fls, error: flsErr } = await supabase
                .from('project_files')
                .select('*')
                .eq('project_id', id)
                .order('created_at', { ascending: false });
            if (flsErr) throw flsErr;
            setFiles(fls);

        } catch (error) {
            console.error('Error fetching project detail:', error);
            // navigate('/projects');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        const { data } = await supabase.from('users').select('id, first_name, second_name').order('first_name');
        setUsers(data || []);
    };

    const fetchBudgetData = async () => {
        // Fetch services linked to this project
        const { data: svcData } = await supabase
            .from('project_services')
            .select('*, services:service_id(name, description, price)')
            .eq('project_id', id);
        setProjectServices(svcData || []);

        // Fetch manual budget lines
        const { data: lineData } = await supabase
            .from('project_budget_lines')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: true });
        setBudgetLines(lineData || []);
    };

    useEffect(() => {
        if (id) {
            fetchProjectData();
            fetchUsers();
            fetchBudgetData();

            // Subscriptions
            const channel = supabase.channel(`project-${id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_milestones', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_files', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_services', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_budget_lines', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .subscribe();

            return () => { supabase.removeChannel(channel); };
        }
    }, [id]);

    const handleAddMilestone = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const { error } = await supabase
                .from('project_milestones')
                .insert([{ ...newMilestone, project_id: id }]);
            if (error) throw error;
            setMilestoneModal(false);
            setNewMilestone({ title: '', target_date: '', status: 'pending' });
            showNotification('Hito añadido correctamente');
            fetchProjectData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setFormLoading(false);
        }
    };

    const handleAddTask = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const { error } = await supabase
                .from('project_tasks')
                .insert([{ ...newTask, project_id: id }]);
            if (error) throw error;
            setTaskModal(false);
            setNewTask({ title: '', priority: 'Media', assigned_to: '' });
            showNotification('Tarea creada correctamente');
            fetchProjectData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setFormLoading(false);
        }
    };

    const handleAddBudgetLine = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const { error } = await supabase
                .from('project_budget_lines')
                .insert([{
                    project_id: id,
                    description: newBudgetLine.description,
                    unit_price: parseFloat(newBudgetLine.unit_price) || 0,
                    quantity: parseInt(newBudgetLine.quantity) || 1,
                    iva_percent: parseFloat(newBudgetLine.iva_percent) || 21
                }]);
            if (error) throw error;
            setBudgetLineModal(false);
            setNewBudgetLine({ description: '', unit_price: '', quantity: 1, iva_percent: 21 });
            showNotification('Línea de presupuesto añadida');
            fetchBudgetData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeleteBudgetLine = async (lineId) => {
        const { error } = await supabase.from('project_budget_lines').delete().eq('id', lineId);
        if (error) showNotification(`Error: ${error.message}`, 'error');
        else fetchBudgetData();
    };

    const handleRemoveProjectService = async (psId) => {
        const { error } = await supabase.from('project_services').delete().eq('id', psId);
        if (error) showNotification(`Error: ${error.message}`, 'error');
        else fetchBudgetData();
    };

    // Cálculos de presupuesto
    const serviceLines = projectServices.map(ps => {
        const price = parseFloat(ps.services?.price) || 0;
        return { description: ps.services?.name || 'Servicio', base: price, iva: price * 0.21, total: price * 1.21, isService: true, id: ps.id };
    });
    const manualLines = budgetLines.map(bl => {
        const base = (parseFloat(bl.unit_price) || 0) * (parseInt(bl.quantity) || 1);
        const iva = base * ((parseFloat(bl.iva_percent) || 0) / 100);
        return { description: bl.description, base, iva, total: base + iva, isService: false, id: bl.id, quantity: bl.quantity, unit_price: bl.unit_price, iva_percent: bl.iva_percent };
    });
    const allBudgetLines = [...serviceLines, ...manualLines];
    const budgetSubtotal = allBudgetLines.reduce((sum, l) => sum + l.base, 0);
    const budgetIVA = allBudgetLines.reduce((sum, l) => sum + l.iva, 0);
    const budgetTotal = allBudgetLines.reduce((sum, l) => sum + l.total, 0);

    if (loading && !project) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0F0716]">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!project) return <div className="p-20 text-center text-variable-main">Proyecto no encontrado</div>;

    const progressValue = project.total_hours > 0 ? (project.actual_hours / project.total_hours) * 100 : 0;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const taskProgress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <Link to="/projects" className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors mb-6 sm:mb-8 group">
                        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="font-medium">Volver a Proyectos</span>
                    </Link>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest leading-none">
                                {darkMode ? 'Claro' : 'Oscuro'}
                            </span>
                        </button>
                    </div>
                </div>

                <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-8 sm:mb-12">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg ${project.status === 'Completado' ? 'bg-emerald-500 text-white' : 'bg-primary text-white'
                                }`}>
                                {project.status}
                            </span>
                            <span className="text-variable-muted text-[10px] sm:text-xs font-bold tracking-widest uppercase">ID: {project.id_alias || project.id.slice(0, 8)}</span>
                        </div>
                        <h1 className="text-3xl sm:text-5xl font-bold font-display tracking-tight text-variable-main">{project.name}</h1>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-variable-muted text-base sm:text-lg">
                            <p className="flex items-center gap-2">
                                Cliente: <span className="text-variable-main font-bold">{project.client}</span>
                            </p>
                            {project.leads && (
                                <p className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-xl text-xs font-bold text-primary border border-primary/20">
                                    <Target size={14} />
                                    Lead: <Link to="/leads" className="hover:underline">{project.leads.company || `${project.leads.first_name} ${project.leads.last_name}`}</Link>
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <button className="glass flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm text-variable-main hover:brightness-110 transition-all shadow-sm">
                            <Share2 size={18} /> Compartir
                        </button>
                        <button className="bg-primary text-white flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-sm hover:brightness-110 transition-all shadow-xl shadow-primary/20">
                            <Edit3 size={18} /> Editar Proyecto
                        </button>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* HITOS */}
                    <div className="lg:col-span-3">
                        <div className="glass rounded-[2rem] p-8 h-full min-h-[400px]">
                            <h3 className="text-xl font-bold mb-10 flex items-center justify-between text-variable-main">
                                <div className="flex items-center gap-3">
                                    <Calendar size={20} className="text-primary" /> Hitos
                                </div>
                                <button onClick={() => setMilestoneModal(true)} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                    <Plus size={16} />
                                </button>
                            </h3>
                            <div className="relative space-y-12 pl-4 border-l border-variable">
                                {milestones.length === 0 && <p className="text-xs text-variable-muted italic">No hay hitos definidos.</p>}
                                {milestones.map((m, i) => (
                                    <div key={m.id} className="relative">
                                        <div className={`absolute -left-[25.5px] top-1 size-4 rounded-full border-4 border-variable shadow-lg ${m.status === 'completed' ? 'bg-primary shadow-primary/40' : (m.status === 'in_progress' ? 'bg-primary animate-pulse' : 'bg-variable-muted opacity-50')
                                            }`} />
                                        <div className="flex justify-between items-start group">
                                            <div>
                                                <p className={`text-sm font-bold ${m.status === 'pending' ? 'text-variable-muted' : (m.status === 'in_progress' ? 'text-primary' : 'text-variable-main')}`}>
                                                    {m.title}
                                                </p>
                                                <p className="text-xs text-variable-muted mt-1">{m.target_date ? new Date(m.target_date).toLocaleDateString() : (m.status === 'in_progress' ? 'En curso' : 'Pendiente')}</p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const newStatus = m.status === 'completed' ? 'pending' : 'completed';
                                                    await supabase.from('project_milestones').update({ status: newStatus }).eq('id', m.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-primary hover:bg-primary/10 rounded-md"
                                                title="Cambiar Estado"
                                            >
                                                <CheckCircle2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-6 space-y-10">
                        {/* CHART RESUMEN */}
                        <div className="glass rounded-[2.5rem] p-10 flex flex-col items-center">
                            <h3 className="text-xl font-bold self-start mb-10 text-variable-main">Resumen de Progreso</h3>
                            <div className="relative size-60 flex items-center justify-center">
                                <svg className="size-full -rotate-90">
                                    <circle cx="120" cy="120" r="100" fill="transparent" stroke="currentColor" strokeWidth="16" className="text-variable-muted opacity-10" />
                                    <motion.circle
                                        initial={{ strokeDashoffset: 628 }}
                                        animate={{ strokeDashoffset: 628 * (1 - (taskProgress / 100)) }}
                                        cx="120" cy="120" r="100" fill="transparent" stroke="#f3791b" strokeWidth="16"
                                        strokeDasharray="628" strokeLinecap="round"
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                    />
                                </svg>
                                <div className="absolute flex flex-col items-center">
                                    <span className="text-5xl font-black font-display tracking-tighter text-variable-main">{Math.round(taskProgress)}%</span>
                                    <span className="text-[10px] font-bold text-variable-muted uppercase tracking-widest mt-1 text-center">Tareas Listas</span>
                                </div>
                            </div>
                        </div>

                        {/* TAREAS */}
                        <div className="glass rounded-[2rem] p-8 overflow-visible">
                            <h3 className="font-bold mb-6 flex items-center justify-between text-variable-main">
                                <div className="flex items-center gap-2">
                                    Tareas Prioritarias
                                    <span className="text-xs font-normal text-variable-muted">({tasks.length})</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setTaskModal(true)} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                        <Plus size={16} />
                                    </button>
                                    <button className="text-primary text-xs hover:underline">Gestionar Kanban</button>
                                </div>
                            </h3>
                            <div className="space-y-4">
                                {tasks.length === 0 && (
                                    <div className="py-10 text-center border-2 border-dashed border-variable rounded-3xl">
                                        <p className="text-sm text-variable-muted">No hay tareas pendientes.</p>
                                    </div>
                                )}
                                {tasks.slice(0, 5).map((task) => (
                                    <div key={task.id} className="p-5 rounded-2xl bg-white/5 border border-variable flex items-center justify-between hover:bg-white/10 transition-all group cursor-pointer">
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const newStatus = task.status === 'done' ? 'todo' : 'done';
                                                    await supabase.from('project_tasks').update({ status: newStatus }).eq('id', task.id);
                                                }}
                                                className={`p-2 rounded-xl transition-all ${task.status === 'done' ? 'bg-emerald-500/10 text-emerald-500 scale-110' : 'bg-primary/10 text-primary hover:scale-110'}`}
                                            >
                                                {task.status === 'done' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
                                            </button>
                                            <div>
                                                <p className={`font-bold text-sm ${task.status === 'done' ? 'text-variable-muted line-through' : 'text-variable-main'}`}>{task.title}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase inline-block ${task.priority === 'Alta' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                        (task.priority === 'Media' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')
                                                        }`}>
                                                        {task.priority}
                                                    </span>
                                                    {task.assigned_to && (
                                                        <span className="text-[9px] text-variable-muted font-bold uppercase italic">
                                                            Asignado a: {users.find(u => u.id === task.assigned_to)?.first_name || '...'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 space-y-10 order-first lg:order-last">
                        {/* RECURSOS / HORAS */}
                        <div className="glass rounded-[2rem] p-8 flex flex-col">
                            <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-variable-main">
                                Recursos
                                <BarChart3 size={18} className="text-variable-muted" />
                            </h3>
                            <div className="space-y-6">
                                <div className="space-y-2 text-variable-main">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                        <span className="text-variable-muted">Horas Reales</span>
                                        <span>{project.actual_hours} / {project.total_hours}</span>
                                    </div>
                                    <div className="h-2 bg-white/5 border border-variable rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(progressValue, 100)}%` }} className="h-full bg-primary" />
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Eficiencia</p>
                                    <p className="text-2xl font-black text-variable-main">
                                        {progressValue > 80 ? '+12.4%' : (progressValue > 50 ? '+5.2%' : 'Nueva')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ARCHIVOS */}
                        <div className="glass rounded-[2.5rem] p-8">
                            <h3 className="text-lg font-bold mb-8 flex items-center justify-between text-variable-main">
                                Archivos
                                <button className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                    <Plus size={16} />
                                </button>
                            </h3>
                            <div className="space-y-4">
                                {files.length === 0 && <p className="text-xs text-variable-muted italic">No hay archivos adjuntos.</p>}
                                {files.map((file) => (
                                    <div key={file.id} className="flex items-center gap-4 group cursor-pointer text-variable-main">
                                        <div className="p-3 bg-white/5 border border-variable rounded-2xl group-hover:text-primary transition-colors"><Download size={20} /></div>
                                        <div className="flex-1 overflow-hidden">
                                            <p className="text-sm font-bold truncate">{file.name}</p>
                                            <p className="text-[10px] text-variable-muted font-bold uppercase">{file.size || '---'} • {file.file_type || 'FILE'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════ */}
                {/* SECCIÓN PRESUPUESTO / SERVICIOS                */}
                {/* ═══════════════════════════════════════════════ */}
                <section className="mt-10">
                    <div className="glass rounded-[2.5rem] p-8 sm:p-10">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                            <button onClick={() => setBudgetExpanded(!budgetExpanded)} className="flex items-center gap-3 group">
                                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                    <Receipt size={22} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-variable-main flex items-center gap-2">
                                        Presupuesto / Servicios
                                        {budgetExpanded ? <ChevronUp size={18} className="text-variable-muted" /> : <ChevronDown size={18} className="text-variable-muted" />}
                                    </h3>
                                    <p className="text-xs text-variable-muted italic">Líneas de servicio contratadas y extras manuales</p>
                                </div>
                            </button>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setBudgetLineModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all">
                                    <Plus size={14} /> Añadir Línea Manual
                                </button>
                                <button onClick={() => showNotification('Funcionalidad de factura próximamente', 'info')} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                                    <Receipt size={14} /> Generar Factura
                                </button>
                            </div>
                        </div>

                        {budgetExpanded && (
                            <div className="space-y-4">
                                {/* Header de la tabla */}
                                <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-variable-muted">
                                    <div className="col-span-5">Concepto</div>
                                    <div className="col-span-1 text-right">Cant.</div>
                                    <div className="col-span-2 text-right">Precio Unit.</div>
                                    <div className="col-span-1 text-right">IVA %</div>
                                    <div className="col-span-2 text-right">Total</div>
                                    <div className="col-span-1"></div>
                                </div>

                                {allBudgetLines.length === 0 && (
                                    <div className="py-12 text-center border-2 border-dashed border-variable rounded-3xl">
                                        <Receipt size={32} className="mx-auto text-variable-muted mb-3 opacity-50" />
                                        <p className="text-sm text-variable-muted">No hay líneas de presupuesto.</p>
                                        <p className="text-xs text-variable-muted italic mt-1">Añade servicios al crear el proyecto o agrega líneas manuales.</p>
                                    </div>
                                )}

                                {/* Servicios contratados */}
                                {serviceLines.map((line) => (
                                    <div key={`svc-${line.id}`} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center px-5 py-4 rounded-2xl bg-white/5 border border-variable hover:bg-white/[0.08] transition-colors">
                                        <div className="sm:col-span-5 flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                <Briefcase size={14} className="text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-variable-main">{line.description}</p>
                                                <p className="text-[9px] text-primary font-bold uppercase tracking-widest">Servicio contratado</p>
                                            </div>
                                        </div>
                                        <div className="sm:col-span-1 text-right text-xs text-variable-muted font-bold">1</div>
                                        <div className="sm:col-span-2 text-right text-xs text-variable-main font-bold">€{line.base.toFixed(2)}</div>
                                        <div className="sm:col-span-1 text-right text-xs text-variable-muted font-bold">21%</div>
                                        <div className="sm:col-span-2 text-right text-sm font-black text-variable-main">€{line.total.toFixed(2)}</div>
                                        <div className="sm:col-span-1 flex justify-end">
                                            <button onClick={() => handleRemoveProjectService(line.id)} className="p-1.5 text-variable-muted hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-500/10" title="Quitar servicio">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Líneas manuales */}
                                {manualLines.map((line) => (
                                    <div key={`man-${line.id}`} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center px-5 py-4 rounded-2xl bg-white/5 border border-variable hover:bg-white/[0.08] transition-colors">
                                        <div className="sm:col-span-5 flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                                <DollarSign size={14} className="text-emerald-500" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-variable-main">{line.description}</p>
                                                <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Línea manual</p>
                                            </div>
                                        </div>
                                        <div className="sm:col-span-1 text-right text-xs text-variable-muted font-bold">{line.quantity}</div>
                                        <div className="sm:col-span-2 text-right text-xs text-variable-main font-bold">€{parseFloat(line.unit_price).toFixed(2)}</div>
                                        <div className="sm:col-span-1 text-right text-xs text-variable-muted font-bold">{line.iva_percent}%</div>
                                        <div className="sm:col-span-2 text-right text-sm font-black text-variable-main">€{line.total.toFixed(2)}</div>
                                        <div className="sm:col-span-1 flex justify-end">
                                            <button onClick={() => handleDeleteBudgetLine(line.id)} className="p-1.5 text-variable-muted hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-500/10" title="Eliminar línea">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Totales */}
                                {allBudgetLines.length > 0 && (
                                    <div className="mt-6 pt-6 border-t border-variable">
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex justify-between w-full sm:w-72 text-sm">
                                                <span className="text-variable-muted font-bold">Subtotal (Base)</span>
                                                <span className="text-variable-main font-bold">€{budgetSubtotal.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between w-full sm:w-72 text-sm">
                                                <span className="text-variable-muted font-bold">IVA Total</span>
                                                <span className="text-variable-main font-bold">€{budgetIVA.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between w-full sm:w-72 text-lg pt-2 border-t border-variable">
                                                <span className="text-primary font-black uppercase tracking-widest text-sm">Total</span>
                                                <span className="text-primary font-black">€{budgetTotal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {/* MODALS */}
            <AnimatePresence>
                {milestoneModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMilestoneModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nuevo Hito</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Define un punto de control clave</p>
                            <form onSubmit={handleAddMilestone} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Título del Hito</label>
                                    <input required value={newMilestone.title} onChange={e => setNewMilestone({ ...newMilestone, title: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Fase de Diseño Lista" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Fecha Límite</label>
                                    <input required type="date" value={newMilestone.target_date} onChange={e => setNewMilestone({ ...newMilestone, target_date: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" />
                                </div>
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Guardando...' : 'Añadir Hito'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}

                {taskModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTaskModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nueva Tarea</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Asigna una acción específica</p>
                            <form onSubmit={handleAddTask} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Título de la Tarea</label>
                                    <input required value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Revisar contrato SLA" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Prioridad</label>
                                        <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                            <option>Baja</option>
                                            <option>Media</option>
                                            <option>Alta</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Asignar a</label>
                                        <select value={newTask.assigned_to} onChange={e => setNewTask({ ...newTask, assigned_to: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                            <option value="">Sin asignar</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.first_name} {u.second_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Crear Tarea' : 'Crear Tarea'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}

                {/* MODAL: NUEVA LÍNEA DE PRESUPUESTO */}
                {budgetLineModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBudgetLineModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nueva Línea de Presupuesto</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Añade un concepto manual con precio e IVA individual</p>
                            <form onSubmit={handleAddBudgetLine} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Concepto / Descripción</label>
                                    <input required value={newBudgetLine.description} onChange={e => setNewBudgetLine({ ...newBudgetLine, description: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Diseño landing page extra" />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Precio Unit. (€)</label>
                                        <input required type="number" step="0.01" min="0" value={newBudgetLine.unit_price} onChange={e => setNewBudgetLine({ ...newBudgetLine, unit_price: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" placeholder="0.00" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Cantidad</label>
                                        <input required type="number" min="1" value={newBudgetLine.quantity} onChange={e => setNewBudgetLine({ ...newBudgetLine, quantity: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">IVA %</label>
                                        <input required type="number" step="0.5" min="0" max="100" value={newBudgetLine.iva_percent} onChange={e => setNewBudgetLine({ ...newBudgetLine, iva_percent: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                    </div>
                                </div>
                                {/* Preview */}
                                {newBudgetLine.unit_price && (
                                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-sm">
                                        <div className="flex justify-between text-variable-muted">
                                            <span>Base:</span>
                                            <span className="font-bold text-variable-main">€{((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-variable-muted mt-1">
                                            <span>IVA ({newBudgetLine.iva_percent}%):</span>
                                            <span className="font-bold text-variable-main">€{(((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)) * ((parseFloat(newBudgetLine.iva_percent) || 0) / 100)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-primary font-black mt-2 pt-2 border-t border-primary/20">
                                            <span>Total:</span>
                                            <span>€{(((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)) * (1 + (parseFloat(newBudgetLine.iva_percent) || 0) / 100)).toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Guardando...' : 'Añadir Línea'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

