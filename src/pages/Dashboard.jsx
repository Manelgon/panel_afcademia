import React, { useState, useEffect, useMemo } from 'react';
import {
    LayoutDashboard,
    Users as IconUsers,
    FolderOpen,
    TrendingUp,
    Wallet,
    Clock,
    Search,
    Bell,
    Sun,
    Moon,
    ArrowUpRight,
    Target,
    Briefcase,
    ListTodo,
    Calendar as CalendarIcon,
    CheckCircle2,
    CircleDot,
    AlertTriangle,
    Receipt,
    Banknote,
    FileText,
    ChevronRight,
    Activity,
    Plus,
    UserPlus,
    DollarSign,
    Circle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useGlobalLoading } from '../context/LoadingContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';

/* ─── Stat Card ─── */
const StatCard = ({ title, value, subtitle, icon: Icon, color = 'primary', delay = 0 }) => {
    const colorMap = {
        primary: { bg: 'bg-primary/10', text: 'text-primary', shadow: 'shadow-primary/10' },
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', shadow: 'shadow-emerald-500/10' },
        violet: { bg: 'bg-violet-500/10', text: 'text-violet-500', shadow: 'shadow-violet-500/10' },
        amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', shadow: 'shadow-amber-500/10' },
    };
    const c = colorMap[color] || colorMap.primary;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            className={`glass p-6 rounded-3xl relative overflow-hidden group hover:shadow-xl ${c.shadow} transition-all duration-300`}
        >
            <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 ${c.bg} rounded-2xl ${c.text}`}>
                    <Icon size={24} />
                </div>
            </div>
            <p className="text-variable-muted text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
            <h3 className="text-3xl font-black font-display text-variable-main tracking-tight">{value}</h3>
            {subtitle && <p className="text-xs text-variable-muted mt-1">{subtitle}</p>}
        </motion.div>
    );
};

/* ─── Priority Badge ─── */
const PriorityBadge = ({ priority }) => {
    const styles = {
        'Crítica': 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        'Alta': 'bg-primary/15 text-primary border-primary/30',
        'Media': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        'Baja': 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    };
    return (
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${styles[priority] || styles['Media']}`}>
            {priority}
        </span>
    );
};

/* ─── Status Badge ─── */
const StatusBadge = ({ status }) => {
    const styles = {
        'pendiente': { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-500', label: 'Pendiente' },
        'contactado': { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'Contactado' },
        'ganado': { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-500', label: 'Ganado' },
        'perdido': { bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-400', label: 'Perdido' },
    };
    const s = styles[status] || styles['pendiente'];
    return (
        <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${s.bg} ${s.text}`}>
            {s.label}
        </span>
    );
};

/* ─── Task Status Icon ─── */
const TaskStatusIcon = ({ status }) => {
    const map = {
        pending: { icon: Circle, color: 'text-variable-muted' },
        in_progress: { icon: CircleDot, color: 'text-primary' },
        review: { icon: AlertTriangle, color: 'text-violet-400' },
        done: { icon: CheckCircle2, color: 'text-emerald-500' },
    };
    const m = map[status] || map.pending;
    const I = m.icon;
    return <I size={14} className={m.color} />;
};

export default function Dashboard() {
    const { darkMode, toggleTheme } = useTheme();
    const { profile } = useAuth();
    const { withLoading } = useGlobalLoading();
    const navigate = useNavigate();

    // ─── State ───
    const [loading, setLoading] = useState(true);
    const [leads, setLeads] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [milestones, setMilestones] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [payments, setPayments] = useState([]);
    const [users, setUsers] = useState([]);
    const [projectTasks, setProjectTasks] = useState([]);

    // ─── Fetch All Data ───
    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [
                    { data: leadsData },
                    { data: projectsData },
                    { data: tasksData },
                    { data: milestonesData },
                    { data: invoicesData },
                    { data: paymentsData },
                    { data: usersData },
                    { data: allTasksData },
                ] = await Promise.all([
                    supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(10),
                    supabase.from('projects').select('*').order('created_at', { ascending: false }),
                    supabase.from('project_tasks').select('*, projects(name)').order('created_at', { ascending: false }).limit(8),
                    supabase.from('project_milestones').select('*, projects(name)').gte('target_date', new Date().toISOString().split('T')[0]).order('target_date', { ascending: true }).limit(6),
                    supabase.from('project_invoices').select('*').order('created_at', { ascending: false }),
                    supabase.from('project_payments').select('*').order('created_at', { ascending: false }),
                    supabase.from('users').select('id, first_name, second_name, email, avatar_url'),
                    supabase.from('project_tasks').select('id, status, project_id'),
                ]);

                setLeads(leadsData || []);
                setProjects(projectsData || []);
                setTasks(tasksData || []);
                setMilestones(milestonesData || []);
                setInvoices(invoicesData || []);
                setPayments(paymentsData || []);
                setUsers(usersData || []);
                setProjectTasks(allTasksData || []);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    // ─── Computed KPIs ───
    const totalLeads = leads.length;
    const activeProjects = projects.filter(p => p.status === 'En Progreso' || p.status === 'Pendiente').length;
    const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
    const totalPaid = payments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
    const pendingBalance = Math.max(0, totalInvoiced - totalPaid);

    // User map for display
    const userMap = useMemo(() => {
        const map = {};
        users.forEach(u => {
            map[u.id] = { name: `${u.first_name || ''} ${u.second_name || ''}`.trim() || u.email, avatar: u.avatar_url };
        });
        return map;
    }, [users]);

    // Projects with task progress
    const activeProjectsList = useMemo(() => {
        return projects
            .filter(p => p.status === 'En Progreso' || p.status === 'Pendiente')
            .slice(0, 5)
            .map(p => {
                const pTasks = projectTasks.filter(t => t.project_id === p.id);
                const done = pTasks.filter(t => t.status === 'done').length;
                const total = pTasks.length;
                const progress = total > 0 ? Math.round((done / total) * 100) : 0;
                return { ...p, progress, tasksDone: done, tasksTotal: total };
            });
    }, [projects, projectTasks]);

    // Activity feed
    const activityFeed = useMemo(() => {
        const items = [];

        // Recent leads
        leads.slice(0, 3).forEach(l => {
            items.push({
                id: `lead-${l.id}`,
                type: 'lead',
                icon: UserPlus,
                color: 'text-blue-400',
                bg: 'bg-blue-500/10',
                text: `Nuevo lead: ${l.first_name} ${l.last_name}`,
                sub: l.company || l.email,
                date: l.created_at,
            });
        });

        // Recent invoices
        invoices.slice(0, 3).forEach(inv => {
            items.push({
                id: `inv-${inv.id}`,
                type: 'invoice',
                icon: Receipt,
                color: 'text-primary',
                bg: 'bg-primary/10',
                text: `Factura ${inv.invoice_number} generada`,
                sub: `€${parseFloat(inv.total || 0).toFixed(2)}`,
                date: inv.created_at,
            });
        });

        // Recent payments
        payments.slice(0, 3).forEach(pay => {
            items.push({
                id: `pay-${pay.id}`,
                type: 'payment',
                icon: DollarSign,
                color: 'text-emerald-500',
                bg: 'bg-emerald-500/10',
                text: `Cobro ${pay.payment_number} registrado`,
                sub: `€${parseFloat(pay.amount || 0).toFixed(2)}`,
                date: pay.created_at,
            });
        });

        // Recent tasks done
        tasks.filter(t => t.status === 'done').slice(0, 3).forEach(t => {
            items.push({
                id: `task-${t.id}`,
                type: 'task',
                icon: CheckCircle2,
                color: 'text-emerald-500',
                bg: 'bg-emerald-500/10',
                text: `Tarea completada: ${t.title}`,
                sub: t.projects?.name || '',
                date: t.updated_at || t.created_at,
            });
        });

        return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
    }, [leads, invoices, payments, tasks]);

    const formatDate = (d) => {
        if (!d) return '';
        const date = new Date(d);
        const now = new Date();
        const diff = now - date;
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    };

    const formatCurrency = (n) => {
        if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`;
        return `€${n.toFixed(0)}`;
    };

    // Greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    const userName = profile?.first_name || profile?.name || 'Admin';

    if (loading) {
        return (
            <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-main)' }}>
                    <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                {/* ═══ HEADER ═══ */}
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-1 text-variable-main">
                            {greeting}, <span className="text-primary">{userName}</span>
                        </h1>
                        <div className="flex items-center gap-2 text-variable-muted">
                            <Clock size={14} />
                            <span className="text-xs">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button className="p-3 glass rounded-2xl text-variable-muted hover:text-primary relative transition-all">
                            <Bell size={20} />
                            {activityFeed.length > 0 && (
                                <span className="absolute top-2 right-2 size-2 bg-primary rounded-full animate-pulse" />
                            )}
                        </button>
                    </div>
                </header>

                {/* ═══ KPI CARDS ═══ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
                    <StatCard title="Leads Totales" value={totalLeads} subtitle={`${leads.filter(l => l.status === 'pendiente').length} pendientes`} icon={Target} color="primary" delay={0} />
                    <StatCard title="Proyectos Activos" value={activeProjects} subtitle={`${projects.length} total`} icon={FolderOpen} color="violet" delay={0.1} />
                    <StatCard title="Total Facturado" value={`€${totalInvoiced.toFixed(2)}`} subtitle={`${invoices.length} facturas`} icon={Receipt} color="emerald" delay={0.2} />
                    <StatCard title="Pendiente de Cobro" value={`€${pendingBalance.toFixed(2)}`} subtitle={pendingBalance <= 0 ? 'Todo cobrado ✓' : `${Math.round((totalPaid / (totalInvoiced || 1)) * 100)}% cobrado`} icon={Wallet} color="amber" delay={0.3} />
                </div>

                {/* ═══ LEADS TABLE + PROJECTS ═══ */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-10">
                    {/* Leads Table */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className="lg:col-span-2 glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Target size={18} /></div>
                                <h2 className="text-lg sm:text-xl font-bold font-display text-variable-main">Últimos Leads</h2>
                            </div>
                            <Link to="/leads" className="text-primary hover:underline text-xs font-bold flex items-center gap-1">
                                Ver todos <ArrowUpRight size={14} />
                            </Link>
                        </div>
                        {leads.length === 0 ? (
                            <div className="py-12 text-center text-variable-muted">
                                <Target size={32} className="mx-auto mb-3 opacity-50" />
                                <p className="text-sm">No hay leads registrados</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto -mx-6 sm:mx-0 px-6 sm:px-0">
                                <table className="w-full text-left min-w-[500px]">
                                    <thead className="text-variable-muted text-[10px] uppercase tracking-[0.2em] font-bold border-b border-variable">
                                        <tr>
                                            <th className="pb-4">Nombre</th>
                                            <th className="pb-4 hidden sm:table-cell">Email</th>
                                            <th className="pb-4">Fuente</th>
                                            <th className="pb-4">Estado</th>
                                            <th className="pb-4 text-right">Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-variable">
                                        {leads.slice(0, 5).map(lead => (
                                            <tr key={lead.id} className="group hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => navigate('/leads')}>
                                                <td className="py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center text-xs font-black flex-shrink-0">
                                                            {(lead.first_name?.[0] || '').toUpperCase()}{(lead.last_name?.[0] || '').toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-sm text-variable-main truncate">{lead.first_name} {lead.last_name}</p>
                                                            {lead.company && <p className="text-[10px] text-variable-muted truncate">{lead.company}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 hidden sm:table-cell">
                                                    <span className="text-xs text-variable-muted">{lead.email}</span>
                                                </td>
                                                <td className="py-4">
                                                    <span className="text-[10px] px-2.5 py-1 glass rounded-lg border border-variable text-variable-muted font-bold">{lead.source || 'Web'}</span>
                                                </td>
                                                <td className="py-4"><StatusBadge status={lead.status} /></td>
                                                <td className="py-4 text-right">
                                                    <span className="text-[10px] text-variable-muted font-medium">{formatDate(lead.created_at)}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>

                    {/* Active Projects */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className="glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-violet-500/10 rounded-xl text-violet-400"><FolderOpen size={18} /></div>
                                <h2 className="text-lg font-bold font-display text-variable-main">Proyectos</h2>
                            </div>
                            <Link to="/projects" className="text-primary hover:underline text-xs font-bold flex items-center gap-1">
                                Ver <ArrowUpRight size={14} />
                            </Link>
                        </div>
                        <div className="space-y-4">
                            {activeProjectsList.length === 0 ? (
                                <div className="py-12 text-center text-variable-muted">
                                    <FolderOpen size={28} className="mx-auto mb-3 opacity-50" />
                                    <p className="text-sm">Sin proyectos activos</p>
                                </div>
                            ) : (
                                activeProjectsList.map(p => (
                                    <Link
                                        key={p.id}
                                        to={`/projects/${p.id}`}
                                        className="flex items-center gap-4 group p-3 rounded-2xl border border-transparent hover:border-variable hover:bg-white/[0.02] transition-all"
                                    >
                                        {/* Mini Progress */}
                                        <div className="relative size-11 flex items-center justify-center flex-shrink-0">
                                            <svg className="size-full -rotate-90">
                                                <circle cx="22" cy="22" r="18" fill="transparent" stroke="currentColor" strokeWidth="3" className="text-variable-muted opacity-10" />
                                                <circle cx="22" cy="22" r="18" fill="transparent" stroke="#f3791b" strokeWidth="3"
                                                    strokeDasharray={`${2 * Math.PI * 18}`}
                                                    strokeDashoffset={`${2 * Math.PI * 18 * (1 - p.progress / 100)}`}
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                            <span className="absolute text-[9px] font-black text-variable-main">{p.progress}%</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-variable-main group-hover:text-primary transition-colors truncate">{p.name}</p>
                                            <p className="text-[10px] text-variable-muted">{p.client} · {p.tasksDone}/{p.tasksTotal} tareas</p>
                                        </div>
                                        <ChevronRight size={14} className="text-variable-muted group-hover:text-primary transition-colors flex-shrink-0" />
                                    </Link>
                                ))
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* ═══ TASKS + MILESTONES + FINANCIAL ═══ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-10">
                    {/* Recent Tasks */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                        className="glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><ListTodo size={18} /></div>
                                <h2 className="text-lg font-bold font-display text-variable-main">Tareas Recientes</h2>
                            </div>
                            <Link to="/tasks" className="text-primary hover:underline text-xs font-bold flex items-center gap-1">
                                Ver <ArrowUpRight size={14} />
                            </Link>
                        </div>
                        <div className="space-y-3">
                            {tasks.length === 0 ? (
                                <div className="py-8 text-center text-variable-muted">
                                    <ListTodo size={28} className="mx-auto mb-3 opacity-50" />
                                    <p className="text-sm">Sin tareas</p>
                                </div>
                            ) : (
                                tasks.slice(0, 6).map(t => (
                                    <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.02] transition-colors group">
                                        <TaskStatusIcon status={t.status} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-variable-main truncate group-hover:text-primary transition-colors">{t.title}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <PriorityBadge priority={t.priority} />
                                                {t.projects?.name && (
                                                    <span className="text-[9px] text-variable-muted truncate">{t.projects.name}</span>
                                                )}
                                            </div>
                                        </div>
                                        {t.assigned_to && userMap[t.assigned_to] && (
                                            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0" title={userMap[t.assigned_to].name}>
                                                <span className="text-[9px] font-black text-primary">
                                                    {userMap[t.assigned_to].name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>

                    {/* Upcoming Milestones */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                        className="glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-violet-500/10 rounded-xl text-violet-400"><CalendarIcon size={18} /></div>
                                <h2 className="text-lg font-bold font-display text-variable-main">Próximos Hitos</h2>
                            </div>
                            <Link to="/calendar" className="text-primary hover:underline text-xs font-bold flex items-center gap-1">
                                Ver <ArrowUpRight size={14} />
                            </Link>
                        </div>
                        {milestones.length === 0 ? (
                            <div className="py-8 text-center text-variable-muted">
                                <CalendarIcon size={28} className="mx-auto mb-3 opacity-50" />
                                <p className="text-sm">Sin hitos próximos</p>
                            </div>
                        ) : (
                            <div className="relative pl-6 border-l border-variable space-y-6">
                                {milestones.slice(0, 5).map((m, i) => {
                                    const isFirst = i === 0;
                                    return (
                                        <div key={m.id} className="relative">
                                            <div className={`absolute -left-[31px] top-1 size-3.5 rounded-full border-[3px] ${isFirst ? 'bg-primary border-primary/50 shadow-lg shadow-primary/30' : 'bg-variable-muted border-variable opacity-60'}`} />
                                            <div>
                                                <p className={`text-sm font-bold ${isFirst ? 'text-primary' : 'text-variable-main'}`}>{m.title}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] text-variable-muted font-medium">
                                                        {m.target_date ? new Date(m.target_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : 'Sin fecha'}
                                                    </span>
                                                    {m.projects?.name && (
                                                        <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary rounded-md font-bold">{m.projects.name}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>

                    {/* Financial Summary */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                        className="glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500"><Banknote size={18} /></div>
                            <h2 className="text-lg font-bold font-display text-variable-main">Resumen Financiero</h2>
                        </div>

                        <div className="space-y-6">
                            {/* Total facturado */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1">Total Facturado</p>
                                <p className="text-3xl font-black font-display text-variable-main">€{totalInvoiced.toFixed(2)}</p>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span className="text-emerald-500">Cobrado: €{totalPaid.toFixed(2)}</span>
                                    <span className="text-amber-500">Pendiente: €{pendingBalance.toFixed(2)}</span>
                                </div>
                                <div className="h-3 bg-white/5 border border-variable rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0}%` }}
                                        transition={{ duration: 1.2, ease: 'easeOut' }}
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                                    />
                                </div>
                            </div>

                            {/* Mini stats */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-2xl bg-white/[0.03] border border-variable">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-1">Facturas</p>
                                    <p className="text-xl font-black text-variable-main">{invoices.length}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/[0.03] border border-variable">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-1">Cobros</p>
                                    <p className="text-xl font-black text-variable-main">{payments.length}</p>
                                </div>
                            </div>

                            {/* Revenue per project - top 3 */}
                            {invoices.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-variable-muted mb-3">Top Proyectos</p>
                                    <div className="space-y-2">
                                        {(() => {
                                            const projectTotals = {};
                                            invoices.forEach(inv => {
                                                const pId = inv.project_id;
                                                const proj = projects.find(p => p.id === pId);
                                                if (proj) {
                                                    projectTotals[pId] = (projectTotals[pId] || { name: proj.name, total: 0 });
                                                    projectTotals[pId].total += parseFloat(inv.total || 0);
                                                }
                                            });
                                            return Object.values(projectTotals)
                                                .sort((a, b) => b.total - a.total)
                                                .slice(0, 3)
                                                .map((p, i) => (
                                                    <div key={i} className="flex items-center justify-between">
                                                        <span className="text-xs text-variable-muted truncate flex-1 mr-2">{p.name}</span>
                                                        <span className="text-xs font-bold text-variable-main">€{p.total.toFixed(2)}</span>
                                                    </div>
                                                ));
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* ═══ ACTIVITY FEED ═══ */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                    className="glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Activity size={18} /></div>
                        <h2 className="text-lg font-bold font-display text-variable-main">Actividad Reciente</h2>
                    </div>
                    {activityFeed.length === 0 ? (
                        <div className="py-8 text-center text-variable-muted">
                            <Activity size={28} className="mx-auto mb-3 opacity-50" />
                            <p className="text-sm">Sin actividad reciente</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {activityFeed.map(item => {
                                const I = item.icon;
                                return (
                                    <div key={item.id} className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.02] border border-variable hover:border-primary/20 transition-all group">
                                        <div className={`p-2 rounded-xl ${item.bg} ${item.color} flex-shrink-0`}>
                                            <I size={14} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-variable-main truncate group-hover:text-primary transition-colors">{item.text}</p>
                                            <p className="text-[10px] text-variable-muted truncate mt-0.5">{item.sub}</p>
                                            <p className="text-[9px] text-variable-muted mt-1 font-medium">{formatDate(item.date)}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}
