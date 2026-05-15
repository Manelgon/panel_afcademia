import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft,
    Layers,
    Users as UsersIcon,
    Award,
    CheckCircle2,
    Calendar,
    Edit3,
    RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import EditarGrupoModal from '../components/curso/EditarGrupoModal';
import { useNotifications } from '../context/NotificationContext';
import { refreshMatriculasLive } from '../lib/evolcampusLive';

export default function GrupoDetail() {
    const { courseid, groupid } = useParams();
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(true);
    const [course, setCourse] = useState(null);
    const [group, setGroup] = useState(null);
    const [matriculas, setMatriculas] = useState([]);
    const [editarGrupoOpen, setEditarGrupoOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const refreshInFlightRef = useRef(false);

    const fetchAll = async () => {
        setLoading(true);
        let rows = [];
        try {
            const [coursesRes, groupsRes] = await Promise.all([
                supabase.functions.invoke('evolcampus-list-courses', { body: { include_inactive: true } }),
                supabase.functions.invoke('evolcampus-get-course-groups', {
                    body: { idCourse: Number(courseid), status: 'ACTIVE', include_from_enrollments: true }
                })
            ]);
            if (!coursesRes.error) {
                const c = (coursesRes.data?.courses || []).find(c => Number(c.courseid) === Number(courseid));
                setCourse(c || null);
            }
            if (!groupsRes.error) {
                const g = (groupsRes.data?.groups || []).find(g => Number(g.id) === Number(groupid));
                setGroup(g || null);
            }

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
                .eq('evolcampus_groupid', Number(groupid));
            if (error) {
                showNotification('Error cargando alumnos del grupo: ' + error.message, 'error');
            } else {
                rows = data || [];
                setMatriculas(rows);
            }
        } finally {
            setLoading(false);
        }
        return rows;
    };

    const refreshLive = async (localRows) => {
        if (refreshInFlightRef.current) return;
        if (!groupid) return;
        refreshInFlightRef.current = true;
        setRefreshing(true);
        try {
            await refreshMatriculasLive({
                filterParams: { groupid: Number(groupid) },
                localMatriculas: localRows ?? matriculas,
                setMatriculas
            });
            setLastSync(new Date());
        } catch (err) {
            console.warn('[GrupoDetail] live refresh failed:', err);
        } finally {
            refreshInFlightRef.current = false;
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchAll().then(rows => { if (rows.length > 0) refreshLive(rows); });
    }, [courseid, groupid]);

    useEffect(() => {
        const onFocus = () => { if (matriculas.length > 0) refreshLive(matriculas); };
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && matriculas.length > 0) refreshLive(matriculas);
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [matriculas]);

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
        alumnos: new Set(matriculas.map(m => m.alumno_id)).size,
        completadas: matriculas.filter(m => m.passed && (parseFloat(m.completedpercent) || 0) >= 100).length,
        progresoMedio: matriculas.length > 0
            ? matriculas.reduce((s, m) => s + (parseFloat(m.completedpercent) || 0), 0) / matriculas.length
            : 0
    };

    const isArchived = group?.status && group.status !== 'ACTIVE';

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <button
                    onClick={() => navigate(`/cursos/${courseid}`)}
                    className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest mb-6"
                >
                    <ArrowLeft size={14} /> {course?.course_name || 'Curso'}
                </button>

                {/* Header */}
                <header className="glass rounded-[2rem] p-6 sm:p-8 mb-6 border border-variable">
                    <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
                        <div className="flex items-start gap-5 min-w-0 flex-1">
                            <div className="size-16 sm:size-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                                <Layers size={28} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-variable-main truncate">
                                        {group?.name || 'Grupo'}
                                    </h1>
                                    {isArchived && (
                                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-500 border border-gray-500/20">
                                            Archivado
                                        </span>
                                    )}
                                    {group?.type && (
                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${group.type === 'SYNCRONOUS' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                            {group.type === 'SYNCRONOUS' ? 'Síncrono' : 'Asíncrono'}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-variable-muted uppercase tracking-widest font-black mt-1">
                                    ID {groupid} · {course?.course_name || `Curso ${courseid}`}
                                </p>
                                {group && (
                                    <p className="text-xs text-variable-muted mt-2 flex items-center gap-2">
                                        <Calendar size={12} />
                                        {group.type === 'SYNCRONOUS'
                                            ? `${group.startdate || '—'} → ${group.enddate || '—'}`
                                            : group.duration ? `${group.duration} días` : '—'}
                                    </p>
                                )}
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
                            {group && !isArchived && (
                                <button
                                    onClick={() => setEditarGrupoOpen(true)}
                                    className="inline-flex items-center gap-2 px-4 py-3 glass rounded-2xl text-xs font-bold text-primary hover:bg-primary/10 transition-all border border-primary/20"
                                >
                                    <Edit3 size={14} /> Editar grupo
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                        { label: 'Matriculados (evol)', value: group?.numstudents ?? '—', icon: UsersIcon, color: 'text-primary' },
                        { label: 'Alumnos locales', value: stats.alumnos, icon: UsersIcon, color: 'text-blue-500' },
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

                {/* Tabla de alumnos */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <DataTable
                        tableId={`alumnos-grupo-${groupid}`}
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

                {editarGrupoOpen && group && (
                    <EditarGrupoModal
                        group={group}
                        onClose={() => setEditarGrupoOpen(false)}
                        onSaved={() => fetchAll()}
                        showNotification={showNotification}
                    />
                )}
            </main>
        </div>
    );
}
