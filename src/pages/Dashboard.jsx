import React, { useState, useEffect, useMemo } from 'react';
import {
    LayoutDashboard,
    Users as IconUsers,
    TrendingUp,
    Clock,
    Sun,
    Moon,
    Target,
    Activity,
    UserPlus,
    CheckCircle2,
    ArrowUpRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';

const StatCard = ({ title, value, subtitle, icon: Icon, color = 'primary', delay = 0 }) => {
    const colorMap = {
        primary: { bg: 'bg-primary/10', text: 'text-primary', shadow: 'shadow-primary/10' },
        blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', shadow: 'shadow-blue-500/10' },
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', shadow: 'shadow-emerald-500/10' },
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
            <div className={`p-3 w-fit ${c.bg} rounded-2xl ${c.text} mb-4`}>
                <Icon size={24} />
            </div>
            <p className="text-variable-muted text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
            <h3 className="text-3xl font-black font-display text-variable-main tracking-tight">{value}</h3>
            {subtitle && <p className="text-xs text-variable-muted mt-1">{subtitle}</p>}
        </motion.div>
    );
};

export default function Dashboard() {
    const { darkMode, toggleTheme } = useTheme();
    const { profile } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [leads, setLeads] = useState([]);
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState({
        totalLeads: 0,
        activeLeads: 0,
        convertedLeads: 0,
        totalUsers: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);

            // Helper: query con timeout REAL usando Promise.race
            const queryWithTimeout = async (label, queryFn, ms = 10000) => {
                console.log(`[Dashboard] Fetching ${label}...`);
                const start = Date.now();
                try {
                    const result = await Promise.race([
                        queryFn(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
                        )
                    ]);
                    console.log(`[Dashboard] ${label} OK (${Date.now() - start}ms):`, result.data?.length ?? 0, 'rows');
                    if (result.error) {
                        console.error(`[Dashboard] ${label} Supabase error:`, result.error.message, result.error);
                    }
                    return result;
                } catch (err) {
                    console.error(`[Dashboard] ${label} FAILED (${Date.now() - start}ms):`, err.message);
                    return { data: [], error: err };
                }
            };

            try {
                const leadsRes = await queryWithTimeout('leads', () =>
                    supabase.from('leads').select('*, flujos_embudo(status_actual)').order('fecha_creacion', { ascending: false })
                );

                const usersRes = await queryWithTimeout('profiles', () =>
                    supabase.from('profiles').select('*')
                );

                const leadsData = leadsRes.data || [];
                const usersData = usersRes.data || [];

                setLeads(leadsData);
                setUsers(usersData);

                setStats({
                    totalLeads: leadsData.length,
                    activeLeads: leadsData.filter(l => (l.flujos_embudo?.[0]?.status_actual || 'nuevo') !== 'convertido' && (l.flujos_embudo?.[0]?.status_actual || 'nuevo') !== 'perdido').length,
                    convertedLeads: leadsData.filter(l => l.flujos_embudo?.[0]?.status_actual === 'convertido').length,
                    totalUsers: usersData.length
                });
            } catch (err) {
                console.error('[Dashboard] Error general:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const activityFeed = useMemo(() => {
        const items = [];
        leads.slice(0, 5).forEach(l => {
            items.push({
                id: `lead-${l.id}`,
                icon: UserPlus,
                color: 'text-primary',
                bg: 'bg-primary/10',
                text: `Nuevo lead: ${l.nombre}`,
                sub: l.empresa_nombre || l.email,
                date: l.fecha_creacion
            });
        });
        return items.sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [leads]);

    const userName = profile?.nombre || 'Admin';

    if (loading) {
        return (
            <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center bg-variable-main">
                    <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-1 text-variable-main">
                            Bienvenido, <span className="text-primary">{userName}</span>
                        </h1>
                        <p className="text-variable-muted text-sm flex items-center gap-2">
                            <Clock size={14} /> Panel de Control AFCademIA
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    <StatCard title="Leads Totales" value={stats.totalLeads} icon={Target} color="primary" delay={0} />
                    <StatCard title="En Proceso" value={stats.activeLeads} icon={Activity} color="blue" delay={0.1} />
                    <StatCard title="Convertidos" value={stats.convertedLeads} icon={CheckCircle2} color="emerald" delay={0.2} />
                    <StatCard title="Tu Equipo" value={stats.totalUsers} icon={IconUsers} color="amber" delay={0.3} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2 glass rounded-[2.5rem] p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-bold font-display text-variable-main">Actividad Reciente</h2>
                            <Link to="/leads" className="text-primary hover:underline text-xs font-bold flex items-center gap-1">Ver todos <ArrowUpRight size={14} /></Link>
                        </div>
                        <div className="space-y-4">
                            {activityFeed.length === 0 ? (
                                <p className="text-center text-variable-muted py-10">No hay actividad reciente</p>
                            ) : (
                                activityFeed.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-variable mb-3 hover:bg-white/10 transition-all cursor-pointer" onClick={() => navigate('/leads')}>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl ${item.bg} ${item.color}`}>
                                                <item.icon size={20} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-variable-main">{item.text}</p>
                                                <p className="text-xs text-variable-muted">{item.sub}</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-variable-muted font-bold uppercase">{new Date(item.date).toLocaleDateString()}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass rounded-[2.5rem] p-8">
                        <h2 className="text-xl font-bold font-display text-variable-main mb-8 text-center">Estado del Embudo</h2>
                        <div className="space-y-6">
                            {[
                                { label: 'Nuevos', value: leads.filter(l => (l.flujos_embudo?.[0]?.status_actual || 'nuevo') === 'nuevo').length, total: stats.totalLeads, color: 'bg-blue-500' },
                                { label: 'Contactados', value: leads.filter(l => l.flujos_embudo?.[0]?.status_actual === 'contactado').length, total: stats.totalLeads, color: 'bg-indigo-500' },
                                { label: 'En Proceso', value: leads.filter(l => l.flujos_embudo?.[0]?.status_actual === 'en_proceso').length, total: stats.totalLeads, color: 'bg-amber-500' },
                                { label: 'Convertidos', value: leads.filter(l => l.flujos_embudo?.[0]?.status_actual === 'convertido').length, total: stats.totalLeads, color: 'bg-emerald-500' }
                            ].map((item, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-variable-muted">
                                        <span>{item.label}</span>
                                        <span>{item.value}</span>
                                    </div>
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${(item.value / (item.total || 1)) * 100}%` }} transition={{ duration: 1, delay: 0.6 + i * 0.1 }} className={`h-full ${item.color}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
