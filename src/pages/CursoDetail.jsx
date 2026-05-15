import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft,
    BookOpen,
    Layers,
    Users as UsersIcon,
    Plus,
    Calendar,
    Award,
    CheckCircle2,
    Edit3,
    RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import NuevoGrupoModal from '../components/curso/NuevoGrupoModal';
import EditarGrupoModal from '../components/curso/EditarGrupoModal';
import { useNotifications } from '../context/NotificationContext';
import { refreshMatriculasLive } from '../lib/evolcampusLive';

const TABS = [
    { id: 'grupos', label: 'Grupos', icon: Layers },
    { id: 'alumnos', label: 'Alumnos', icon: UsersIcon }
];

export default function CursoDetail() {
    const { courseid } = useParams();
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(true);
    const [course, setCourse] = useState(null);
    const [groups, setGroups] = useState([]);
    const [matriculas, setMatriculas] = useState([]);
    const [activeTab, setActiveTab] = useState('grupos');
    const [nuevoGrupoOpen, setNuevoGrupoOpen] = useState(false);
    const [editarGrupo, setEditarGrupo] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const refreshInFlightRef = useRef(false);

    const fetchCourseAndGroups = async () => {
        setLoading(true);
        try {
            const [coursesRes, groupsRes] = await Promise.all([
                supabase.functions.invoke('evolcampus-list-courses', { body: { include_inactive: true } }),
                supabase.functions.invoke('evolcampus-get-course-groups', {
                    body: { idCourse: Number(courseid), status: 'ACTIVE', include_from_enrollments: true }
                })
            ]);
            if (coursesRes.error) {
                showNotification('Error cargando curso', 'error');
            } else {
                const c = (coursesRes.data?.courses || []).find(c => Number(c.courseid) === Number(courseid));
                setCourse(c || null);
            }
            if (groupsRes.error) {
                showNotification('Error cargando grupos del curso', 'error');
            } else {
                setGroups(groupsRes.data?.groups || []);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchMatriculas = async () => {
        // Matrículas locales filtradas por los groupids de este curso (los obtenemos de groups).
        if (!groups || groups.length === 0) {
            setMatriculas([]);
            return [];
        }
        const groupIds = groups.map(g => Number(g.id)).filter(Boolean);
        if (groupIds.length === 0) { setMatriculas([]); return []; }
        const { data, error } = await supabase
            .from('matriculas')
            .select(`
                id, curso_nombre, grupo_nombre,
                evolcampus_groupid, evolcampus_enrollmentid,
                completedpercent, grade, passed, enrollmentstatus, lastconnect,
                fecha_matricula,
                alumno_id,
                alumnos(id, nombre, apellidos, dni, email, evolcampus_userid),
                clientes(id, razon_social)
            `)
            .in('evolcampus_groupid', groupIds);
        if (error) { showNotification('Error cargando matrículas: ' + error.message, 'error'); return []; }
        const rows = data || [];
        setMatriculas(rows);
        return rows;
    };

    // Refresca los campos vivos (completedpercent, passed, lastconnect, etc.) llamando a
    // evolCampus filtrando por studyid del curso. Re-entrada protegida con un ref para
    // evitar carreras cuando se dispara por focus + cambio de grupos a la vez.
    const refreshLive = async (localRows) => {
        if (refreshInFlightRef.current) return;
        if (!courseid) return;
        refreshInFlightRef.current = true;
        setRefreshing(true);
        try {
            await refreshMatriculasLive({
                filterParams: { studyid: Number(courseid) },
                localMatriculas: localRows ?? matriculas,
                setMatriculas
            });
            setLastSync(new Date());
        } catch (err) {
            console.warn('[CursoDetail] live refresh failed:', err);
        } finally {
            refreshInFlightRef.current = false;
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchCourseAndGroups();
    }, [courseid]);

    useEffect(() => {
        if (groups.length > 0) {
            // Tras pintar lo local, dispara el refresh en directo (no bloquea la UI).
            fetchMatriculas().then(rows => { if (rows.length > 0) refreshLive(rows); });
        } else {
            setMatriculas([]);
        }
    }, [groups]);

    // Re-sincroniza cuando la pestaña vuelve a primer plano + polling cada 30s.
    useEffect(() => {
        const onFocus = () => {
            if (matriculas.length > 0) refreshLive(matriculas);
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && matriculas.length > 0) refreshLive(matriculas);
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible' && matriculas.length > 0) refreshLive(matriculas);
        }, 30000);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
            clearInterval(interval);
        };
    }, [matriculas]);

    const matriculasByGroup = (() => {
        const m = {};
        for (const r of matriculas) {
            const k = Number(r.evolcampus_groupid);
            if (!m[k]) m[k] = [];
            m[k].push(r);
        }
        return m;
    })();

    if (loading) {
        return (
            <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    const stats = {
        grupos: groups.length,
        alumnos: new Set(matriculas.map(m => m.alumno_id)).size,
        completadas: matriculas.filter(m => m.passed && (parseFloat(m.completedpercent) || 0) >= 100).length,
        progresoMedio: matriculas.length > 0
            ? matriculas.reduce((s, m) => s + (parseFloat(m.completedpercent) || 0), 0) / matriculas.length
            : 0
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <button
                    onClick={() => navigate('/cursos')}
                    className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest mb-6"
                >
                    <ArrowLeft size={14} /> Cursos
                </button>

                {/* Header */}
                <header className="glass rounded-[2rem] p-6 sm:p-8 mb-6 border border-variable">
                    <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
                        <div className="flex items-start gap-5 min-w-0 flex-1">
                            <div className="size-16 sm:size-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                                <BookOpen size={28} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-variable-main truncate">
                                    {course?.course_name || 'Curso'}
                                </h1>
                                <p className="text-[10px] text-variable-muted uppercase tracking-widest font-black mt-1">ID {courseid}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => refreshLive(matriculas)}
                                disabled={refreshing}
                                title={lastSync ? `Actualizado ${lastSync.toLocaleTimeString('es-ES')}` : 'Sincronizar con evolCampus'}
                                className="inline-flex items-center gap-2 px-3 py-3 glass rounded-2xl text-variable-muted hover:text-primary border border-variable transition-all disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                                <span className="text-[10px] uppercase font-bold tracking-widest hidden sm:inline">
                                    {refreshing ? 'Sincronizando…' : 'En directo'}
                                </span>
                            </button>
                            <button
                                onClick={() => setNuevoGrupoOpen(true)}
                                className="inline-flex items-center gap-2 px-4 py-3 bg-primary text-white rounded-2xl font-bold text-xs hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                            >
                                <Plus size={14} /> Nuevo grupo
                            </button>
                        </div>
                    </div>
                </header>

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                        { label: 'Grupos', value: stats.grupos, icon: Layers, color: 'text-primary' },
                        { label: 'Alumnos', value: stats.alumnos, icon: UsersIcon, color: 'text-blue-500' },
                        { label: 'Completados', value: stats.completadas, icon: Award, color: 'text-emerald-500' },
                        { label: 'Progreso medio', value: `${Math.round(stats.progresoMedio)}%`, icon: CheckCircle2, color: 'text-amber-500' }
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

                {/* Content */}
                <AnimatePresence mode="wait">
                    {activeTab === 'grupos' && (
                        <motion.div key="grupos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <DataTable
                                tableId={`grupos-curso-${courseid}`}
                                data={groups}
                                rowKey="id"
                                onRowClick={(g) => navigate(`/cursos/${courseid}/grupos/${g.id}`)}
                                columns={[
                                    {
                                        key: 'name',
                                        label: 'Grupo',
                                        render: (g) => (
                                            <div className="flex items-center gap-2">
                                                <div>
                                                    <p className="font-bold text-variable-main">{g.name}</p>
                                                    <p className="text-[10px] text-variable-muted uppercase tracking-widest">ID {g.id}</p>
                                                </div>
                                                {g.status && g.status !== 'ACTIVE' && (
                                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-500 border border-gray-500/20">
                                                        Archivado
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    },
                                    {
                                        key: 'tipo',
                                        label: 'Tipo',
                                        render: (g) => (
                                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${g.type === 'SYNCRONOUS' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                                {g.type === 'SYNCRONOUS' ? 'Síncrono' : 'Asíncrono'}
                                            </span>
                                        )
                                    },
                                    {
                                        key: 'fechas',
                                        label: 'Fechas',
                                        render: (g) => {
                                            if (g.type === 'SYNCRONOUS') {
                                                return (
                                                    <span className="text-xs text-variable-muted flex items-center gap-1">
                                                        <Calendar size={11} />
                                                        {g.startdate || '—'} → {g.enddate || '—'}
                                                    </span>
                                                );
                                            }
                                            return <span className="text-xs text-variable-muted">{g.duration} días</span>;
                                        }
                                    },
                                    {
                                        key: 'matriculados',
                                        label: 'Matriculados',
                                        render: (g) => {
                                            const local = (matriculasByGroup[Number(g.id)] || []).length;
                                            return (
                                                <span className="text-xs">
                                                    <span className="text-variable-main font-bold">{g.numstudents}</span>
                                                    {local !== g.numstudents && (
                                                        <span className="text-[10px] text-variable-muted ml-1">(local: {local})</span>
                                                    )}
                                                </span>
                                            );
                                        }
                                    },
                                    {
                                        key: 'progreso',
                                        label: 'Progreso medio',
                                        render: (g) => {
                                            const ms = matriculasByGroup[Number(g.id)] || [];
                                            if (ms.length === 0) return <span className="text-variable-muted text-[10px]">—</span>;
                                            // null cuenta como 0 (matriculado sin progreso reportado todavía)
                                            const pct = ms.reduce((s, m) => s + (parseFloat(m.completedpercent) || 0), 0) / ms.length;
                                            const pctR = Math.round(pct);
                                            const color = pctR >= 80 ? 'bg-emerald-500' : pctR >= 50 ? 'bg-blue-500' : 'bg-amber-500';
                                            return (
                                                <div className="min-w-[120px]">
                                                    <p className="text-[10px] font-black text-variable-main mb-1">{pctR}%</p>
                                                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                                        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(pctR, 100)}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        }
                                    },
                                    {
                                        key: 'actions',
                                        label: '',
                                        align: 'right',
                                        render: (g) => (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setEditarGrupo(g); }}
                                                title="Editar grupo en evolCampus"
                                                className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                        )
                                    }
                                ]}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'alumnos' && (
                        <motion.div key="alumnos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <DataTable
                                tableId={`alumnos-curso-${courseid}`}
                                data={matriculas}
                                rowKey="id"
                                onRowClick={(m) => m.alumno_id && navigate(`/alumnos/${m.alumno_id}`)}
                                columns={[
                                    {
                                        key: 'alumno',
                                        label: 'Alumno',
                                        render: (m) => {
                                            const a = m.alumnos;
                                            if (!a) return <span className="text-variable-muted text-[10px]">—</span>;
                                            return (
                                                <div>
                                                    <p className="font-bold text-variable-main">{a.nombre} {a.apellidos}</p>
                                                    <p className="text-[10px] text-variable-muted uppercase tracking-widest">{a.dni || '—'}</p>
                                                </div>
                                            );
                                        }
                                    },
                                    {
                                        key: 'grupo',
                                        label: 'Grupo',
                                        render: (m) => <span className="text-xs text-variable-muted">{m.grupo_nombre || `#${m.evolcampus_groupid}`}</span>
                                    },
                                    {
                                        key: 'cliente',
                                        label: 'Cliente',
                                        render: (m) => {
                                            const c = m.clientes;
                                            if (!c) return <span className="text-variable-muted text-[10px]">—</span>;
                                            return (
                                                <Link to={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-variable-main hover:text-primary">
                                                    {c.razon_social || '—'}
                                                </Link>
                                            );
                                        }
                                    },
                                    {
                                        key: 'progreso',
                                        label: 'Progreso',
                                        render: (m) => {
                                            const pct = parseFloat(m.completedpercent);
                                            if (isNaN(pct)) return <span className="text-variable-muted text-[10px]">—</span>;
                                            const color = m.passed ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500';
                                            return (
                                                <div className="min-w-[120px]">
                                                    <p className="text-[10px] font-black text-variable-main mb-1">{Math.round(pct)}%</p>
                                                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                                        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        }
                                    },
                                    {
                                        key: 'estado',
                                        label: 'Estado',
                                        render: (m) => {
                                            const pct = parseFloat(m.completedpercent);
                                            const completed = !isNaN(pct) && pct >= 100;
                                            if (m.passed && completed) return <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Superado</span>;
                                            if (m.enrollmentstatus === 1) return <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-500 border border-gray-500/20">Archivada</span>;
                                            if (m.enrollmentstatus === 2) return <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20">Baja</span>;
                                            return <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">En curso</span>;
                                        }
                                    },
                                    {
                                        key: 'lastconnect',
                                        label: 'Últ. conexión',
                                        render: (m) => m.lastconnect
                                            ? <span className="text-variable-muted text-xs">{new Date(m.lastconnect).toLocaleDateString('es-ES')}</span>
                                            : <span className="text-variable-muted text-[10px]">—</span>
                                    }
                                ]}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {nuevoGrupoOpen && course && (
                        <NuevoGrupoModal
                            course={course}
                            onClose={() => setNuevoGrupoOpen(false)}
                            onSaved={() => fetchCourseAndGroups()}
                            showNotification={showNotification}
                        />
                    )}
                    {editarGrupo && (
                        <EditarGrupoModal
                            group={editarGrupo}
                            onClose={() => setEditarGrupo(null)}
                            onSaved={() => fetchCourseAndGroups()}
                            showNotification={showNotification}
                        />
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
