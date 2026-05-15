import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BookOpen,
    Search,
    Layers,
    Users as UsersIcon,
    ArrowUpRight,
    Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import CustomSelect from '../components/CustomSelect';
import { useNotifications } from '../context/NotificationContext';

export default function Cursos() {
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [courses, setCourses] = useState([]);
    const [matriculasByCourse, setMatriculasByCourse] = useState({});
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos'); // todos | activos | inactivos

    const fetchCourses = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('evolcampus-list-courses', {
                body: { include_inactive: true }
            });
            if (error) {
                let detail = error.message;
                if (error.context?.json) try { const b = await error.context.json(); detail = b?.detail || detail; } catch (_) {}
                showNotification('Error cargando cursos: ' + detail, 'error');
                return;
            }
            setCourses(data?.courses || []);
        } finally {
            setLoading(false);
        }
    };

    // Cargar conteo de matrículas por curso (agregamos por groupid → courseid via courses local)
    const fetchMatriculas = async (courses) => {
        if (!courses?.length) return;
        const groupToCourse = new Map();
        for (const c of courses) {
            for (const g of c.groups || []) groupToCourse.set(Number(g.groupid), Number(c.courseid));
        }
        const { data } = await supabase
            .from('matriculas')
            .select('evolcampus_groupid, alumno_id, completedpercent, passed');
        const byCourse = {};
        for (const m of data || []) {
            const cid = groupToCourse.get(Number(m.evolcampus_groupid));
            if (!cid) continue;
            if (!byCourse[cid]) byCourse[cid] = { alumnos: new Set(), totalPct: 0, totalMatriculas: 0, completadas: 0 };
            byCourse[cid].alumnos.add(m.alumno_id);
            byCourse[cid].totalMatriculas++;
            // null cuenta como 0 (alumno matriculado pero sin progreso reportado todavía)
            byCourse[cid].totalPct += parseFloat(m.completedpercent) || 0;
            if (m.passed && (parseFloat(m.completedpercent) || 0) >= 100) byCourse[cid].completadas++;
        }
        const summary = {};
        for (const [cid, v] of Object.entries(byCourse)) {
            summary[cid] = {
                alumnos: v.alumnos.size,
                progresoMedio: v.totalMatriculas > 0 ? v.totalPct / v.totalMatriculas : 0,
                completadas: v.completadas
            };
        }
        setMatriculasByCourse(summary);
    };

    useEffect(() => {
        (async () => {
            await fetchCourses();
        })();
    }, []);

    useEffect(() => {
        if (courses.length > 0) fetchMatriculas(courses);
    }, [courses]);

    const filtered = courses.filter(c => {
        if (statusFilter === 'activos' && c.status !== 'ACTIVE') return false;
        if (statusFilter === 'inactivos' && c.status === 'ACTIVE') return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (c.course_name || '').toLowerCase().includes(q);
    });

    const activos = courses.filter(c => c.status === 'ACTIVE');
    const stats = {
        total: courses.length,
        activos: activos.length,
        grupos: activos.reduce((s, c) => s + (c.groups?.length || 0), 0),
        alumnos: Object.values(matriculasByCourse).reduce((s, v) => s + (v.alumnos || 0), 0)
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Cursos</h1>
                        <p className="text-variable-muted">Catálogo de cursos en evolCampus</p>
                    </div>
                    <button onClick={fetchCourses} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all" title="Refrescar">
                        <Clock size={20} />
                    </button>
                </header>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    {[
                        { label: 'Cursos totales', value: stats.total, icon: BookOpen, color: 'text-primary' },
                        { label: 'Activos', value: stats.activos, icon: BookOpen, color: 'text-emerald-500' },
                        { label: 'Grupos (activos)', value: stats.grupos, icon: Layers, color: 'text-blue-500' },
                        { label: 'Alumnos matriculados', value: stats.alumnos, icon: UsersIcon, color: 'text-emerald-500' }
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

                <DataTable
                    tableId="cursos"
                    loading={loading}
                    data={filtered}
                    rowKey="courseid"
                    onRowClick={(c) => navigate(`/cursos/${c.courseid}`)}
                    toolbarLeft={
                        <div className="flex flex-wrap items-center gap-3 w-full">
                            <div className="relative flex-1 min-w-[220px] max-w-md">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted pointer-events-none" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-white/5 border border-variable rounded-2xl pl-11 pr-5 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm"
                                    placeholder="Buscar curso..."
                                />
                            </div>
                            <div className="w-full sm:w-48">
                                <CustomSelect
                                    value={statusFilter}
                                    onChange={setStatusFilter}
                                    options={[
                                        { value: 'todos', label: 'Todos' },
                                        { value: 'activos', label: 'Solo activos' },
                                        { value: 'inactivos', label: 'Solo inactivos' }
                                    ]}
                                />
                            </div>
                        </div>
                    }
                    columns={[
                        {
                            key: 'curso',
                            label: 'Curso',
                            render: (c) => (
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                                        <BookOpen size={16} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{c.course_name}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">ID {c.courseid}</p>
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: 'estado',
                            label: 'Estado',
                            render: (c) => c.status === 'ACTIVE' ? (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    Activo
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-500 border border-gray-500/20">
                                    Inactivo
                                </span>
                            )
                        },
                        {
                            key: 'grupos',
                            label: 'Grupos',
                            render: (c) => (
                                <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20">
                                    {c.groups?.length || 0} {(c.groups?.length || 0) === 1 ? 'grupo' : 'grupos'}
                                </span>
                            )
                        },
                        {
                            key: 'alumnos',
                            label: 'Alumnos',
                            render: (c) => {
                                const v = matriculasByCourse[c.courseid];
                                return (
                                    <span className="text-xs text-variable-main">
                                        {v?.alumnos || 0}
                                    </span>
                                );
                            }
                        },
                        {
                            key: 'progreso',
                            label: 'Progreso medio',
                            render: (c) => {
                                const v = matriculasByCourse[c.courseid];
                                if (!v || !v.alumnos) return <span className="text-variable-muted text-[10px]">—</span>;
                                const pct = Math.round(v.progresoMedio);
                                const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500';
                                return (
                                    <div className="min-w-[120px]">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black text-variable-main">{pct}%</span>
                                            {v.completadas > 0 && (
                                                <span className="text-[9px] text-emerald-500 font-black">✓ {v.completadas}</span>
                                            )}
                                        </div>
                                        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'actions',
                            label: '',
                            align: 'right',
                            render: (c) => (
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/cursos/${c.courseid}`); }}
                                    className="inline-flex items-center gap-1 px-3 py-2 glass rounded-xl text-variable-muted hover:text-primary transition-all text-xs font-bold"
                                >
                                    Ver curso <ArrowUpRight size={14} />
                                </button>
                            )
                        }
                    ]}
                />
            </main>
        </div>
    );
}
