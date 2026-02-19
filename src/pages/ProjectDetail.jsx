import React from 'react';
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
    Users,
    FolderOpen,
    Settings,
    Sun,
    Moon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import logo from '../assets/logo.png';

import Sidebar from '../components/Sidebar';

export default function ProjectDetail() {
    const { darkMode, toggleTheme } = useTheme();

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <Link to="/" className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors mb-6 sm:mb-8 group">
                        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="font-medium">Volver al Dashboard</span>
                    </Link>

                    <button
                        onClick={toggleTheme}
                        className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                    >
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        <span className="text-xs font-bold uppercase tracking-widest leading-none">
                            {darkMode ? 'Claro' : 'Oscuro'}
                        </span>
                    </button>
                </div>

                <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-8 sm:mb-12">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white bg-primary px-3 py-1 rounded-lg">
                                En Progreso
                            </span>
                            <span className="text-variable-muted text-[10px] sm:text-xs font-bold tracking-widest uppercase">ID: PRJ-2024-082</span>
                        </div>
                        <h1 className="text-3xl sm:text-5xl font-bold font-display tracking-tight text-variable-main">Automatización Flujo CRM</h1>
                        <p className="text-variable-muted text-base sm:text-lg flex items-center gap-2 flex-wrap">
                            Cliente: <span className="text-variable-main font-bold">Inmobiliaria Premium</span>
                        </p>
                    </div>
                    <div className="flex flex-col xs:flex-row gap-4 w-full sm:w-auto">
                        <button className="glass flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm text-variable-main hover:brightness-110 transition-all shadow-sm">
                            <Share2 size={18} /> Compartir
                        </button>
                        <button className="bg-primary text-white flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-sm hover:brightness-110 transition-all shadow-xl shadow-primary/20">
                            <Edit3 size={18} /> Editar Proyecto
                        </button>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    <div className="lg:col-span-3">
                        <div className="glass rounded-[2rem] p-8 h-full">
                            <h3 className="text-xl font-bold mb-10 flex items-center gap-3 text-variable-main">
                                <Calendar size={20} className="text-primary" /> Hitos
                            </h3>
                            <div className="relative space-y-12 pl-4 border-l border-variable">
                                <div className="relative">
                                    <div className="absolute -left-[25px] top-1 size-4 rounded-full bg-primary border-4 border-variable shadow-lg shadow-primary/40" />
                                    <p className="text-sm font-bold text-variable-main">Reunión de Kickoff</p>
                                    <p className="text-xs text-variable-muted mt-1">12 Ene, 2024</p>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[25px] top-1 size-4 rounded-full bg-primary border-4 border-variable shadow-lg shadow-primary/40" />
                                    <p className="text-sm font-bold text-variable-main">Definición Proceso</p>
                                    <p className="text-xs text-variable-muted mt-1">20 Ene, 2024</p>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[25px] top-1 size-4 rounded-full bg-primary border-4 border-variable animate-pulse" />
                                    <p className="text-sm font-bold text-primary">Desarrollo API</p>
                                    <p className="text-xs text-primary/70 mt-1">En curso</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-6 space-y-10">
                        <div className="glass rounded-[2.5rem] p-10 flex flex-col items-center">
                            <h3 className="text-xl font-bold self-start mb-10 text-variable-main">Resumen de Progreso</h3>
                            <div className="relative size-60 flex items-center justify-center">
                                <svg className="size-full -rotate-90">
                                    <circle cx="120" cy="120" r="100" fill="transparent" stroke="currentColor" strokeWidth="16" className="text-variable-muted opacity-10" />
                                    <motion.circle
                                        initial={{ strokeDashoffset: 628 }}
                                        animate={{ strokeDashoffset: 628 * (1 - 0.65) }}
                                        cx="120" cy="120" r="100" fill="transparent" stroke="#f3791b" strokeWidth="16"
                                        strokeDasharray="628" strokeLinecap="round"
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                    />
                                </svg>
                                <div className="absolute flex flex-col items-center">
                                    <span className="text-5xl font-black font-display tracking-tighter text-variable-main">65%</span>
                                    <span className="text-[10px] font-bold text-variable-muted uppercase tracking-widest mt-1 text-center">Tareas Listas</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass rounded-[2rem] p-8">
                            <h3 className="font-bold mb-6 flex items-center justify-between text-variable-main">
                                Tareas Prioritarias
                                <button className="text-primary text-xs hover:underline">Gestionar Kanban</button>
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { title: 'Configurar Webhooks CRM', priority: 'Alta', icon: Settings },
                                    { title: 'Test Integración API Rest', priority: 'Media', icon: BarChart3 }
                                ].map((task, i) => (
                                    <div key={i} className="p-5 rounded-2xl bg-white/5 border border-variable flex items-center justify-between hover:bg-white/10 transition-all group cursor-pointer">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-primary/10 rounded-xl text-primary"><task.icon size={18} /></div>
                                            <p className="font-bold text-sm text-variable-main">{task.title}</p>
                                        </div>
                                        <span className={`text-[10px] font-black px-3 py-1 rounded-lg border ${task.priority === 'Alta' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'} uppercase`}>
                                            {task.priority}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 space-y-10">
                        <div className="glass rounded-[2rem] p-8 flex flex-col">
                            <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-variable-main">
                                Recursos
                                <BarChart3 size={18} className="text-variable-muted" />
                            </h3>
                            <div className="space-y-6">
                                <div className="space-y-2 text-variable-main">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                        <span className="text-variable-muted">Horas Reales</span>
                                        <span>120 / 180</span>
                                    </div>
                                    <div className="h-2 bg-white/5 border border-variable rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: '66%' }} className="h-full bg-primary" />
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Eficiencia</p>
                                    <p className="text-2xl font-black text-variable-main">+12.4%</p>
                                </div>
                            </div>
                        </div>

                        <div className="glass rounded-[2.5rem] p-8">
                            <h3 className="text-lg font-bold mb-8 text-variable-main">Archivos</h3>
                            <div className="space-y-4">
                                {[
                                    { name: 'Contrato_SLA.pdf', size: '2.4 MB', type: 'PDF' },
                                    { name: 'Wireframes_v2.fig', size: '15.8 MB', type: 'DESIGN' }
                                ].map((file, i) => (
                                    <div key={i} className="flex items-center gap-4 group cursor-pointer text-variable-main">
                                        <div className="p-3 bg-white/5 border border-variable rounded-2xl group-hover:text-primary transition-colors"><Download size={20} /></div>
                                        <div className="flex-1 overflow-hidden">
                                            <p className="text-sm font-bold truncate">{file.name}</p>
                                            <p className="text-[10px] text-variable-muted font-bold uppercase">{file.size} • {file.type}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
