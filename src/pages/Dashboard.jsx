import React, { useState } from 'react';
import {
    LayoutDashboard,
    Users as IconUsers,
    FolderOpen,
    FileText,
    Settings,
    ArrowUpRight,
    TrendingUp,
    Wallet,
    CheckCircle2,
    Clock,
    MoreVertical,
    Search,
    Bell,
    Sun,
    Moon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import logo from '../assets/logo.png';

import Sidebar from '../components/Sidebar';

const StatCard = ({ title, value, change, icon: Icon }) => (
    <div className="glass p-6 rounded-3xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <Icon size={24} />
            </div>
            <span className={`text-sm font-medium ${change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {change}
            </span>
        </div>
        <p className="text-variable-muted text-sm font-medium mb-1">{title}</p>
        <h3 className="text-3xl font-bold font-display text-variable-main">{value}</h3>
    </div>
);

export default function Dashboard() {
    const { darkMode, toggleTheme } = useTheme();
    const [leads] = useState([
        { id: 1, name: 'Alex Rivera', source: 'Web', status: 'Contactado', score: 3 },
        { id: 2, name: 'Sarah Chen', source: 'LinkedIn', status: 'En Proceso', score: 5 },
        { id: 3, name: 'Marco Rossi', source: 'Instagram', status: 'Nuevo', score: 2 },
    ]);

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 p-10 overflow-y-auto">
                <header className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Dashboard <span className="text-primary italic">Premium</span></h1>
                        <div className="flex items-center gap-2 text-variable-muted">
                            <Clock size={16} />
                            <span className="text-sm">Última actualización: hace 5 minutos</span>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted group-hover:text-primary transition-colors" size={20} />
                            <input type="text" placeholder="Buscar..." className="bg-white/5 border border-variable rounded-2xl pl-12 pr-6 py-3 text-sm focus:outline-none focus:border-primary/50 w-64 transition-all text-variable-main" />
                        </div>
                        <button className="p-3 glass rounded-2xl text-variable-muted hover:text-primary relative">
                            <Bell size={24} />
                            <span className="absolute top-2 right-2 size-2.5 bg-primary rounded-full border-2 border-variable"></span>
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
                    <StatCard title="Leads Totales" value="742" change="+12.4%" icon={IconUsers} />
                    <StatCard title="Tasa Conversión" value="18.2%" change="+2.1%" icon={TrendingUp} />
                    <StatCard title="Presupuestos" value="€42.5k" change="-4.3%" icon={Wallet} />
                    <StatCard title="Proyectos" value="8" change="+2" icon={CheckCircle2} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    <div className="lg:col-span-2 glass rounded-[2.5rem] p-8">
                        <div className="flex justify-between items-center mb-8 text-variable-main">
                            <h2 className="text-2xl font-bold font-display">Leads de Canales</h2>
                            <button className="text-primary hover:underline text-sm font-bold flex items-center gap-2">
                                Ver todo <ArrowUpRight size={16} />
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="text-variable-muted text-xs uppercase tracking-[0.2em] font-bold border-b border-variable">
                                    <tr>
                                        <th className="pb-4">Nombre</th>
                                        <th className="pb-4">Origen</th>
                                        <th className="pb-4">Interés</th>
                                        <th className="pb-4">Estado</th>
                                        <th className="pb-4 text-right"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-variable">
                                    {leads.map(lead => (
                                        <tr key={lead.id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className={`size-10 rounded-2xl flex items-center justify-center font-bold text-sm ${lead.id === 1 ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'}`}>
                                                        {lead.name.split(' ').map(n => n[0]).join('')}
                                                    </div>
                                                    <p className="font-bold text-variable-main">{lead.name}</p>
                                                </div>
                                            </td>
                                            <td className="py-6">
                                                <span className="text-sm px-3 py-1.5 glass rounded-xl border-variable text-variable-muted">{lead.source}</span>
                                            </td>
                                            <td className="py-6">
                                                <div className="flex gap-1">
                                                    {[...Array(5)].map((_, i) => (
                                                        <div key={i} className={`size-1.5 rounded-full ${i < lead.score ? 'bg-primary' : 'bg-white/10'}`} />
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-6">
                                                <span className="text-xs font-bold px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20">
                                                    {lead.status}
                                                </span>
                                            </td>
                                            <td className="py-6 text-right">
                                                <button className="text-variable-muted hover:text-primary">
                                                    <MoreVertical size={20} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex flex-col gap-10">
                        <div className="glass rounded-[2.5rem] p-8">
                            <h2 className="text-xl font-bold font-display mb-6 text-variable-main">Proyectos en Curso</h2>
                            <div className="space-y-6">
                                <div className="flex items-center gap-4 group cursor-pointer border border-transparent hover:border-variable p-2 rounded-2xl transition-all text-variable-main">
                                    <div className="relative size-12 flex items-center justify-center">
                                        <svg className="size-full -rotate-90">
                                            <circle cx="24" cy="24" fill="transparent" r="20" stroke="currentColor" strokeWidth="3" className="text-variable-muted opacity-10 translate-x-[-24px] translate-y-[-24px]" />
                                            <circle cx="24" cy="24" fill="transparent" r="20" stroke="#f3791b" strokeWidth="3" strokeDasharray="125" strokeDashoffset="31" strokeLinecap="round" className="translate-x-[-24px] translate-y-[-24px]" />
                                        </svg>
                                        <span className="absolute text-[10px] font-bold">75%</span>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-sm group-hover:text-primary transition-colors">Flujo CRM</h4>
                                        <p className="text-xs text-variable-muted">Inmobiliaria Premium</p>
                                    </div>
                                    <ArrowUpRight size={16} className="text-variable-muted group-hover:text-primary" />
                                </div>
                            </div>
                        </div>

                        <div className="glass rounded-[2.5rem] p-10 flex flex-col flex-1">
                            <h2 className="text-2xl font-bold font-display mb-2 text-variable-main">Presupuestos</h2>
                            <div className="space-y-6 mb-8 mt-auto">
                                <h4 className="text-4xl font-bold text-primary">€85.9k</h4>
                                <div className="h-2 bg-white/5 border border-variable rounded-full overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: '85.9%' }} className="h-full bg-primary" />
                                </div>
                            </div>
                            <button className="w-full py-4 rounded-2xl bg-primary text-white font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                                Nueva Propuesta
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
