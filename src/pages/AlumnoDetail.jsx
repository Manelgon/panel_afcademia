import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft,
    GraduationCap,
    Mail,
    Phone,
    User,
    Hash,
    BookOpen,
    CheckCircle2,
    Clock,
    Award,
    ExternalLink,
    Building2,
    Calendar,
    Plus,
    KeyRound,
    Edit3,
    CalendarPlus,
    X,
    Save,
    Download,
    Archive,
    Ban,
    Eye,
    Power,
    RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import NuevaMatriculaModal from '../components/alumno/NuevaMatriculaModal';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';
import { refreshMatriculasLive } from '../lib/evolcampusLive';

export default function AlumnoDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();

    const [loading, setLoading] = useState(true);
    const [alumno, setAlumno] = useState(null);
    const [matriculas, setMatriculas] = useState([]);
    const [nuevaMatriculaOpen, setNuevaMatriculaOpen] = useState(false);
    const [editCampusOpen, setEditCampusOpen] = useState(false);
    const [resetPwdOpen, setResetPwdOpen] = useState(false);
    const [extendOpen, setExtendOpen] = useState(null); // matricula obj o null
    const [refreshing, setRefreshing] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const refreshInFlightRef = useRef(false);

    const fetchAlumno = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('alumnos')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            setAlumno(data);
        } catch (err) {
            console.error('Error fetching alumno:', err);
            showNotification(`Error al cargar alumno: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchMatriculas = async () => {
        try {
            const { data, error } = await supabase
                .from('matriculas')
                .select(`
                    *,
                    fecha_inicio_curso,
                    fecha_fin_curso,
                    clientes(id, razon_social),
                    fundae_alumnos(id, fundae_id, fundae_seguimiento(numero_expediente, empresa))
                `)
                .eq('alumno_id', id)
                .order('fecha_matricula', { ascending: false });
            if (error) throw error;
            const rows = data || [];
            setMatriculas(rows);
            return rows;
        } catch (err) {
            console.error('Error fetching matriculas:', err);
            showNotification(`Error al cargar matrículas: ${err.message}`, 'error');
            return [];
        }
    };

    // Refresca campos vivos desde evolCampus filtrando por el userid del alumno (si lo tenemos).
    // Si el alumno no tiene userid en evolCampus, se omite el refresh.
    const refreshLive = async (localRows) => {
        if (refreshInFlightRef.current) return;
        const userid = alumno?.evolcampus_userid;
        if (!userid) return;
        refreshInFlightRef.current = true;
        setRefreshing(true);
        try {
            // El helper hace fallback por userid+groupid si una matrícula local no tiene
            // evolcampus_enrollmentid; aquí inyectamos el userid+dni del alumno en cada
            // fila para que ese fallback pueda hacer match aunque la matrícula no los
            // tenga guardados (matrículas manuales antiguas).
            const rowsWithAlumno = (localRows ?? matriculas).map(m => ({
                ...m,
                evolcampus_userid: m.evolcampus_userid || alumno.evolcampus_userid,
                alumnos: m.alumnos || { evolcampus_userid: alumno.evolcampus_userid, dni: alumno.dni }
            }));
            await refreshMatriculasLive({
                filterParams: { userid: Number(userid) },
                localMatriculas: rowsWithAlumno,
                setMatriculas
            });
            setLastSync(new Date());
        } catch (err) {
            console.warn('[AlumnoDetail] live refresh failed:', err);
        } finally {
            refreshInFlightRef.current = false;
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchAlumno();
        fetchMatriculas();
        const channel = supabase
            .channel(`alumno-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alumnos', filter: `id=eq.${id}` }, fetchAlumno)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas', filter: `alumno_id=eq.${id}` }, fetchMatriculas)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [id]);

    // Cuando llega el alumno (con su userid) y hay matrículas, refresca desde evolCampus.
    // Disparamos cuando cualquiera de los dos pasa a "listo": fetchAlumno y fetchMatriculas
    // son paralelos y antes sólo dependíamos del userid, perdiendo el refresh si alumno
    // llegaba primero (matriculas seguía vacía y se abortaba sin dejar reintentos).
    const hasUserid = !!alumno?.evolcampus_userid;
    const hasMatriculas = matriculas.length > 0;
    useEffect(() => {
        if (hasUserid && hasMatriculas) {
            refreshLive(matriculas);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasUserid, hasMatriculas]);

    useEffect(() => {
        const onFocus = () => { if (matriculas.length > 0) refreshLive(matriculas); };
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && matriculas.length > 0) refreshLive(matriculas);
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        // Polling cada 30s mientras la pestaña sea visible.
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible' && matriculas.length > 0) refreshLive(matriculas);
        }, 30000);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
            clearInterval(interval);
        };
    }, [matriculas, alumno?.evolcampus_userid]);

    // Si se pasa groupid el alumno entra directo al home del curso, no al dashboard general.
    const handleAutologin = async (groupid = null) => {
        if (!alumno?.evolcampus_userid) {
            showNotification('Este alumno aún no tiene userid de evolCampus.', 'error');
            return;
        }
        // Si se invoca como onClick directo, groupid llega como SyntheticEvent: lo ignoramos.
        const validGroupid = (typeof groupid === 'string' || typeof groupid === 'number') ? groupid : null;
        const params = { userid: alumno.evolcampus_userid };
        if (validGroupid) params.groupid = validGroupid;
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
                    body: { action: 'getUrlAutologin', method: 'POST', params }
                });
                if (error) throw error;
                const url = data?.urlautologin;
                if (!url) throw new Error('La API no devolvió URL de autologin.');
                window.open(url, '_blank', 'noopener');
            } catch (err) {
                showNotification('Error generando autologin: ' + (err.message || ''), 'error');
            }
        }, validGroupid ? 'Generando acceso al curso...' : 'Generando acceso al campus...');
    };

    // Cambia el estado de una matrícula en evolCampus (0=activa, 1=archivada, 2=baja, 3=solo lectura).
    // Tras éxito, refresca matrículas para reflejar el nuevo enrollmentstatus.
    const handleChangeMatriculaStatus = async (matricula, newStatus) => {
        if (!matricula?.evolcampus_enrollmentid) {
            showNotification('Esta matrícula no está vinculada a evolCampus.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
                    body: {
                        action: 'updateEnrollment',
                        method: 'POST',
                        params: { enrollmentid: matricula.evolcampus_enrollmentid, status: newStatus }
                    }
                });
                if (error) throw error;
                if (data?.result === 0) throw new Error(data?.error || data?.message || 'evolCampus rechazó el cambio.');

                // Actualizar también espejo local para feedback inmediato
                await supabase
                    .from('matriculas')
                    .update({ enrollmentstatus: newStatus })
                    .eq('id', matricula.id);

                const labels = { 0: 'activa', 1: 'archivada', 2: 'baja', 3: 'solo lectura' };
                showNotification(`✅ Matrícula ${labels[newStatus] || ''}.`, 'success');
                fetchMatriculas();
            } catch (err) {
                showNotification('Error cambiando estado: ' + (err.message || ''), 'error');
            }
        }, 'Cambiando estado en campus...');
    };

    // Abre el diploma (URL temporal de evolCampus) en nueva pestaña.
    const handleDownloadDiploma = (matricula) => {
        if (!matricula?.url_diploma) {
            showNotification('Esta matrícula aún no tiene diploma disponible.', 'error');
            return;
        }
        window.open(matricula.url_diploma, '_blank', 'noopener');
    };

    // Propaga cambios del alumno a evolCampus en TODAS sus matrículas
    // (la API no tiene update de "persona" sino update por enrollment).
    // Además persiste los mismos cambios en la tabla local alumnos.
    const handleSaveCampus = async (cambios) => {
        const { email, telefono, dni, nombre, apellidos } = cambios;
        await withLoading(async () => {
            try {
                // 1. Actualizar BD local primero
                const updPayload = {};
                if (nombre !== undefined) updPayload.nombre = nombre;
                if (apellidos !== undefined) updPayload.apellidos = apellidos;
                if (dni !== undefined) updPayload.dni = dni;
                if (email !== undefined) updPayload.email = email;
                if (telefono !== undefined) updPayload.telefono = telefono;
                if (Object.keys(updPayload).length > 0) {
                    const { error: dbErr } = await supabase.from('alumnos').update(updPayload).eq('id', alumno.id);
                    if (dbErr) throw dbErr;
                }

                // 2. Propagar a evolCampus por cada matrícula con enrollmentid
                const enrollmentIds = matriculas.map(m => m.evolcampus_enrollmentid).filter(Boolean);
                if (enrollmentIds.length === 0) {
                    showNotification('Datos guardados en BD. Sin matrículas en evolCampus que actualizar.', 'success');
                    setEditCampusOpen(false);
                    return;
                }
                const personParams = {};
                if (email !== undefined) personParams.email = email;
                if (telefono !== undefined) personParams.phone = telefono;
                if (dni !== undefined) personParams.identification = dni;
                if (nombre !== undefined) personParams.name = nombre;
                if (apellidos !== undefined) personParams.lastname = apellidos;

                let ok = 0;
                let fail = 0;
                for (const enrollmentid of enrollmentIds) {
                    const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
                        body: { action: 'updateEnrollment', method: 'POST', params: { enrollmentid, person: personParams } }
                    });
                    if (error || data?.result === 0) {
                        fail++;
                        console.warn('[updateEnrollment]', enrollmentid, error || data?.error);
                    } else {
                        ok++;
                    }
                }
                if (fail === 0) {
                    showNotification(`✅ Datos actualizados en BD y en ${ok} matrícula(s) de evolCampus.`, 'success');
                } else {
                    showNotification(`Datos en BD ok. evolCampus: ${ok} ok / ${fail} fallidas.`, ok > 0 ? 'success' : 'error');
                }
                setEditCampusOpen(false);
                fetchAlumno();
            } catch (err) {
                showNotification('Error: ' + (err.message || ''), 'error');
            }
        }, 'Actualizando alumno en campus...');
    };

    const handleResetPassword = async (newPwd) => {
        if (!alumno?.email) {
            showNotification('El alumno no tiene email; evolCampus no puede cambiar la clave sin él.', 'error');
            return;
        }
        if (!newPwd || newPwd.length < 4) {
            showNotification('La clave debe tener al menos 4 caracteres.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
                    body: { action: 'changePassword', method: 'POST', params: { email: alumno.email, clave: newPwd } }
                });
                if (error) throw error;
                if (data?.result === 0) throw new Error(data?.error || 'evolCampus rechazó el cambio.');
                showNotification('✅ Clave actualizada en evolCampus.', 'success');
                setResetPwdOpen(false);
            } catch (err) {
                showNotification('Error: ' + (err.message || ''), 'error');
            }
        }, 'Cambiando clave en campus...');
    };

    const handleExtendEnrollment = async (matricula, modo, valor) => {
        // modo: 'days' | 'date'
        const params = { enrollmentid: matricula.evolcampus_enrollmentid };
        if (modo === 'days') {
            const dias = Number(valor);
            if (!dias || dias <= 0) { showNotification('Indica un nº de días válido.', 'error'); return; }
            params.extend_by_days = 1;
            params.extenddays = dias;
        } else {
            if (!valor) { showNotification('Indica una fecha.', 'error'); return; }
            params.extend_by_days = 0;
            params.extenddate = valor; // yyyy-mm-dd
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
                    body: { action: 'extendEnrollmentTime', method: 'POST', params }
                });
                if (error) throw error;
                if (data?.result === 0) throw new Error(data?.message || 'evolCampus rechazó la ampliación.');
                showNotification('✅ Plazo ampliado en evolCampus.', 'success');
                setExtendOpen(null);
                // Refrescamos la matricula con los nuevos datos en próximo sync; sin sync no hay enddate local que mostrar.
            } catch (err) {
                showNotification('Error: ' + (err.message || ''), 'error');
            }
        }, 'Ampliando plazo en campus...');
    };

    if (loading || !alumno) {
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
        total: matriculas.length,
        completadas: matriculas.filter(m => m.passed === true && (parseFloat(m.completedpercent) || 0) >= 100).length,
        enCurso: matriculas.filter(m => m.enrollmentstatus === 0 && !(m.passed && (parseFloat(m.completedpercent) || 0) >= 100)).length,
        promedio: matriculas.length > 0
            ? matriculas.reduce((s, m) => s + (parseFloat(m.completedpercent) || 0), 0) / matriculas.length
            : 0
    };

    const initials = `${(alumno.nombre || '?')[0]}${(alumno.apellidos || '')[0] || ''}`.toUpperCase();

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <button
                    onClick={() => navigate('/alumnos')}
                    className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest mb-6"
                >
                    <ArrowLeft size={14} /> Alumnos
                </button>

                {/* Header */}
                <header className="glass rounded-[2rem] p-6 sm:p-8 mb-6 border border-variable">
                    <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
                        <div className="flex items-start gap-5 min-w-0 flex-1">
                            <div className="size-16 sm:size-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-xl sm:text-2xl flex-shrink-0">
                                {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                    <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-variable-main truncate">
                                        {alumno.nombre} {alumno.apellidos}
                                    </h1>
                                    {alumno.evolcampus_userid && (
                                        <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
                                            Campus
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-4 text-xs text-variable-muted">
                                    {alumno.dni && (
                                        <span className="flex items-center gap-1.5 font-mono">
                                            <Hash size={12} /> {alumno.dni}
                                        </span>
                                    )}
                                    {alumno.email && (
                                        <a href={`mailto:${alumno.email}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                                            <Mail size={12} /> {alumno.email}
                                        </a>
                                    )}
                                    {alumno.telefono && (
                                        <a href={`tel:${alumno.telefono}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                                            <Phone size={12} /> {alumno.telefono}
                                        </a>
                                    )}
                                    {alumno.categoria_profesional && (
                                        <span className="flex items-center gap-1.5">
                                            <User size={12} /> {alumno.categoria_profesional}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">
                            {alumno.evolcampus_userid && (
                                <>
                                    <button
                                        onClick={() => refreshLive(matriculas)}
                                        disabled={refreshing}
                                        title={lastSync ? `Actualizado ${lastSync.toLocaleTimeString('es-ES')}` : 'Sincronizar con evolCampus'}
                                        className="px-3 py-3 glass rounded-2xl text-xs font-bold text-variable-muted hover:text-primary transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                                        <span className="hidden sm:inline">{refreshing ? 'Sincronizando…' : 'En directo'}</span>
                                    </button>
                                    <button
                                        onClick={() => setEditCampusOpen(true)}
                                        className="px-4 py-3 glass rounded-2xl text-xs font-bold text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                                        title="Editar datos del alumno y propagarlos a evolCampus"
                                    >
                                        <Edit3 size={14} /> Editar en campus
                                    </button>
                                    <button
                                        onClick={() => setResetPwdOpen(true)}
                                        className="px-4 py-3 glass rounded-2xl text-xs font-bold text-amber-500 hover:bg-amber-500/10 transition-all flex items-center gap-2 border border-amber-500/20"
                                        title="Resetear la contraseña del alumno en evolCampus"
                                    >
                                        <KeyRound size={14} /> Resetear clave
                                    </button>
                                    <button
                                        onClick={() => handleAutologin()}
                                        className="px-4 py-3 glass rounded-2xl text-xs font-bold text-blue-500 hover:bg-blue-500/10 transition-all flex items-center gap-2 border border-blue-500/20"
                                        title="Acceso directo al campus"
                                    >
                                        <ExternalLink size={14} /> Acceder al campus
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                        { label: 'Matrículas', value: stats.total, icon: BookOpen, color: 'text-primary' },
                        { label: 'Completadas', value: stats.completadas, icon: Award, color: 'text-emerald-500' },
                        { label: 'En curso', value: stats.enCurso, icon: Clock, color: 'text-amber-500' },
                        { label: 'Progreso medio', value: `${Math.round(stats.promedio)}%`, icon: CheckCircle2, color: 'text-blue-500' }
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

                {/* Tabla de matrículas */}
                <div className="glass rounded-[2rem] p-6 border border-variable">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <GraduationCap size={16} /> Matrículas ({matriculas.length})
                        </h3>
                        <button
                            onClick={() => setNuevaMatriculaOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl font-bold text-xs hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                        >
                            <Plus size={14} /> Nueva matrícula
                        </button>
                    </div>

                    {matriculas.length === 0 ? (
                        <p className="text-variable-muted text-sm">Este alumno aún no tiene matrículas.</p>
                    ) : (
                        <DataTable
                            tableId="matriculas-alumno"
                            data={matriculas}
                            rowKey="id"
                            columns={[
                                {
                                    key: 'curso',
                                    label: 'Curso / Grupo',
                                    render: (m) => (
                                        <div>
                                            <p className="font-bold text-variable-main text-sm">
                                                {m.curso_nombre || (m.fundae_alumnos?.fundae_seguimiento?.empresa) || '—'}
                                            </p>
                                            <p className="text-[10px] text-variable-muted uppercase tracking-widest">
                                                {m.grupo_nombre || (m.evolcampus_groupid ? `Grupo ${m.evolcampus_groupid}` : '—')}
                                            </p>
                                        </div>
                                    )
                                },
                                {
                                    key: 'tipo',
                                    label: 'Origen',
                                    render: (m) => {
                                        if (m.tipo === 'fundae') {
                                            const numExp = m.fundae_alumnos?.fundae_seguimiento?.numero_expediente;
                                            return (
                                                <div>
                                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                        FUNDAE
                                                    </span>
                                                    {numExp && (
                                                        <p className="text-[10px] text-variable-muted font-mono mt-0.5">{numExp}</p>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return (
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                                Manual
                                            </span>
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
                                            <Link
                                                to={`/clientes/${c.id}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-xs text-variable-main hover:text-primary transition-colors flex items-center gap-1"
                                            >
                                                <Building2 size={11} /> {c.razon_social || '—'}
                                            </Link>
                                        );
                                    }
                                },
                                {
                                    key: 'progreso',
                                    label: 'Progreso',
                                    render: (m) => {
                                        let pct = parseFloat(m.completedpercent);
                                        if (isNaN(pct)) {
                                            // Si la matrícula está ligada a evolCampus, asumimos 0% (alumno
                                            // matriculado pero sin actividad todavía). Solo dejamos "Sin
                                            // sincronizar" cuando no hay vínculo con el campus en absoluto.
                                            if (m.evolcampus_enrollmentid) pct = 0;
                                            else return <span className="text-variable-muted text-[10px]">Sin sincronizar</span>;
                                        }
                                        const color = m.passed ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500';
                                        return (
                                            <div className="min-w-[140px]">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-black text-variable-main">{Math.round(pct)}%</span>
                                                    {m.grade != null && (
                                                        <span className={`text-[9px] font-bold ${m.passed ? 'text-emerald-500' : 'text-variable-muted'}`}>
                                                            {Number(m.grade).toFixed(1)}
                                                        </span>
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
                                    render: (m) => {
                                        if (!m.lastconnect) return <span className="text-variable-muted text-[10px]">—</span>;
                                        return (
                                            <span className="text-variable-muted text-xs flex items-center gap-1">
                                                <Calendar size={11} /> {new Date(m.lastconnect).toLocaleDateString('es-ES')}
                                            </span>
                                        );
                                    }
                                },
                                {
                                    key: 'fin_dias',
                                    label: 'Finaliza',
                                    render: (m) => {
                                        if (!m.fecha_fin_curso) return <span className="text-variable-muted text-[10px]">—</span>;
                                        // Días restantes calendario (sin horas) en zona local
                                        const fin = new Date(m.fecha_fin_curso + 'T00:00:00');
                                        const hoy = new Date();
                                        hoy.setHours(0, 0, 0, 0);
                                        const dias = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
                                        const pctFin = parseFloat(m.completedpercent);
                                        const finalizada = (m.passed && !isNaN(pctFin) && pctFin >= 100) || m.enrollmentstatus === 1 || m.enrollmentstatus === 2;
                                        const colorBadge = finalizada
                                            ? 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                                            : dias < 0
                                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                                : dias <= 7
                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                                        const labelDias = finalizada
                                            ? 'Finalizada'
                                            : dias < 0
                                                ? `${Math.abs(dias)} d. vencida`
                                                : dias === 0
                                                    ? 'Hoy'
                                                    : `${dias} d. restantes`;
                                        return (
                                            <div className="text-xs">
                                                <span className="text-variable-muted flex items-center gap-1">
                                                    <Calendar size={11} /> {fin.toLocaleDateString('es-ES')}
                                                </span>
                                                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${colorBadge}`}>
                                                    {labelDias}
                                                </span>
                                            </div>
                                        );
                                    }
                                },
                                {
                                    key: 'matriculada',
                                    label: 'Matriculada',
                                    render: (m) => (
                                        <span className="text-variable-muted text-xs">
                                            {m.fecha_matricula ? new Date(m.fecha_matricula).toLocaleDateString('es-ES') : '—'}
                                        </span>
                                    )
                                },
                                {
                                    key: 'actions',
                                    label: '',
                                    align: 'right',
                                    render: (m) => {
                                        if (!m.evolcampus_enrollmentid) return null;
                                        const isActive = m.enrollmentstatus === 0 || m.enrollmentstatus == null;
                                        return (
                                            <div className="flex items-center justify-end gap-1 flex-wrap">
                                                {/* Acceso directo al curso del alumno */}
                                                {alumno.evolcampus_userid && m.evolcampus_groupid && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleAutologin(m.evolcampus_groupid); }}
                                                        title="Acceso directo al curso del alumno"
                                                        className="p-1.5 glass rounded-xl text-blue-500 hover:bg-blue-500/10 transition-colors border border-transparent hover:border-blue-500/20"
                                                    >
                                                        <ExternalLink size={11} />
                                                    </button>
                                                )}
                                                {/* Diploma si está disponible */}
                                                {m.url_diploma && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownloadDiploma(m); }}
                                                        title="Descargar diploma"
                                                        className="p-1.5 glass rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition-colors border border-transparent hover:border-emerald-500/20"
                                                    >
                                                        <Download size={11} />
                                                    </button>
                                                )}
                                                {/* Cambio de estado */}
                                                <StatusMenu m={m} onChange={(s) => handleChangeMatriculaStatus(m, s)} />
                                                {/* Ampliar plazo */}
                                                {isActive && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setExtendOpen(m); }}
                                                        title="Ampliar plazo de finalización (solo asíncronos)"
                                                        className="p-1.5 glass rounded-xl text-amber-500 hover:bg-amber-500/10 transition-colors border border-transparent hover:border-amber-500/20"
                                                    >
                                                        <CalendarPlus size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    }
                                }
                            ]}
                        />
                    )}
                </div>

                <AnimatePresence>
                    {nuevaMatriculaOpen && (
                        <NuevaMatriculaModal
                            alumno={alumno}
                            onClose={() => setNuevaMatriculaOpen(false)}
                            onSaved={() => { fetchMatriculas(); fetchAlumno(); }}
                            showNotification={showNotification}
                        />
                    )}
                    {editCampusOpen && (
                        <EditCampusModal
                            alumno={alumno}
                            onClose={() => setEditCampusOpen(false)}
                            onSave={handleSaveCampus}
                        />
                    )}
                    {resetPwdOpen && (
                        <ResetPwdModal
                            alumno={alumno}
                            onClose={() => setResetPwdOpen(false)}
                            onSave={handleResetPassword}
                        />
                    )}
                    {extendOpen && (
                        <ExtendEnrollmentModal
                            matricula={extendOpen}
                            onClose={() => setExtendOpen(null)}
                            onSave={(modo, valor) => handleExtendEnrollment(extendOpen, modo, valor)}
                        />
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}

// ── Modales auxiliares ─────────────────────────────────────────────────

function ModalShell({ title, subtitle, icon: Icon, onClose, children }) {
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center p-4 pb-24 sm:pb-4 overflow-y-auto"
        >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-lg glass rounded-[2rem] p-7 shadow-2xl my-auto"
            >
                <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <X size={18} />
                </button>
                <div className="flex items-center gap-3 mb-5">
                    {Icon && <div className="p-2.5 rounded-2xl bg-primary/10 text-primary"><Icon size={20} /></div>}
                    <div>
                        <h3 className="text-lg font-bold text-variable-main">{title}</h3>
                        {subtitle && <p className="text-xs text-variable-muted">{subtitle}</p>}
                    </div>
                </div>
                {children}
            </motion.div>
        </motion.div>
    );
}

function FieldInput({ label, value, onChange, type = 'text', placeholder = '' }) {
    return (
        <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-widest text-variable-muted mb-1.5">{label}</span>
            <input
                type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="w-full px-4 py-3 bg-white/5 border border-variable rounded-2xl text-variable-main focus:border-primary/50 focus:outline-none transition-all text-sm"
            />
        </label>
    );
}

function EditCampusModal({ alumno, onClose, onSave }) {
    const [form, setForm] = useState({
        nombre: alumno.nombre || '',
        apellidos: alumno.apellidos || '',
        dni: alumno.dni || '',
        email: alumno.email || '',
        telefono: alumno.telefono || ''
    });
    const dirty = (k) => form[k] !== (alumno[k] || '');
    const submit = () => {
        const cambios = {};
        ['nombre', 'apellidos', 'dni', 'email', 'telefono'].forEach(k => { if (dirty(k)) cambios[k] = form[k]; });
        if (Object.keys(cambios).length === 0) { onClose(); return; }
        onSave(cambios);
    };
    return (
        <ModalShell title="Editar alumno en evolCampus" subtitle="Los cambios se guardarán en BD y se propagarán a todas las matrículas en campus." icon={Edit3} onClose={onClose}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldInput label="Nombre" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} />
                <FieldInput label="Apellidos" value={form.apellidos} onChange={v => setForm(f => ({ ...f, apellidos: v }))} />
                <FieldInput label="DNI" value={form.dni} onChange={v => setForm(f => ({ ...f, dni: v.toUpperCase() }))} />
                <FieldInput label="Teléfono" value={form.telefono} onChange={v => setForm(f => ({ ...f, telefono: v }))} />
                <div className="sm:col-span-2">
                    <FieldInput label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
                </div>
            </div>
            <div className="flex gap-3 pt-5 mt-2 border-t border-variable">
                <button onClick={onClose} className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">Cancelar</button>
                <div className="flex-1" />
                <button onClick={submit} className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <Save size={16} /> Guardar y propagar
                </button>
            </div>
        </ModalShell>
    );
}

function ResetPwdModal({ alumno, onClose, onSave }) {
    const [pwd, setPwd] = useState('');
    return (
        <ModalShell title="Resetear clave en evolCampus" subtitle={`Se cambiará la clave del alumno con email ${alumno.email || '(sin email)'} en evolCampus.`} icon={KeyRound} onClose={onClose}>
            <FieldInput label="Nueva clave" value={pwd} onChange={setPwd} placeholder="Mínimo 4 caracteres" />
            <div className="flex gap-3 pt-5 mt-4 border-t border-variable">
                <button onClick={onClose} className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">Cancelar</button>
                <div className="flex-1" />
                <button onClick={() => onSave(pwd)} className="px-6 py-3 bg-amber-500 text-white rounded-2xl font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <KeyRound size={16} /> Cambiar clave
                </button>
            </div>
        </ModalShell>
    );
}

// Menú compacto para cambiar enrollmentstatus de una matrícula.
// 0=activa 1=archivada 2=baja 3=solo lectura
function StatusMenu({ m, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = React.useRef(null);
    React.useEffect(() => {
        if (!open) return;
        const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const current = m.enrollmentstatus ?? 0;
    const options = [
        { value: 0, label: 'Activar', icon: Power, color: 'text-emerald-500' },
        { value: 1, label: 'Archivar', icon: Archive, color: 'text-gray-500' },
        { value: 2, label: 'Dar de baja', icon: Ban, color: 'text-rose-500' },
        { value: 3, label: 'Solo lectura', icon: Eye, color: 'text-blue-500' }
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                title="Cambiar estado en campus"
                className="p-1.5 glass rounded-xl text-variable-muted hover:text-primary transition-colors border border-transparent hover:border-primary/20"
            >
                <Power size={11} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-30 glass rounded-2xl border border-variable shadow-xl overflow-hidden min-w-[160px]">
                    {options.filter(o => o.value !== current).map(o => (
                        <button
                            key={o.value}
                            onClick={(e) => { e.stopPropagation(); setOpen(false); onChange(o.value); }}
                            className={`w-full px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-left flex items-center gap-2 hover:bg-white/10 transition-colors ${o.color}`}
                        >
                            <o.icon size={11} /> {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function ExtendEnrollmentModal({ matricula, onClose, onSave }) {
    const [modo, setModo] = useState('days'); // 'days' | 'date'
    const [dias, setDias] = useState('');
    const [fecha, setFecha] = useState('');
    const submit = () => onSave(modo, modo === 'days' ? dias : fecha);
    return (
        <ModalShell title="Ampliar plazo de matrícula" subtitle={matricula.curso_nombre || `Matrícula #${matricula.evolcampus_enrollmentid}`} icon={CalendarPlus} onClose={onClose}>
            <p className="text-[11px] text-variable-muted mb-3">⚠️ Solo válido para grupos asíncronos. Los grupos síncronos tienen fechas fijas.</p>
            <div className="grid grid-cols-2 gap-2 mb-4 p-1.5 bg-white/5 rounded-2xl border border-variable">
                {[
                    { id: 'days', label: 'Por nº de días' },
                    { id: 'date', label: 'Hasta fecha' }
                ].map(o => (
                    <button key={o.id} onClick={() => setModo(o.id)} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modo === o.id ? 'bg-primary text-white shadow' : 'text-variable-muted'}`}>
                        {o.label}
                    </button>
                ))}
            </div>
            {modo === 'days' ? (
                <FieldInput label="Días a ampliar" type="number" value={dias} onChange={setDias} placeholder="Ej. 30" />
            ) : (
                <FieldInput label="Nueva fecha de fin" type="date" value={fecha} onChange={setFecha} />
            )}
            <div className="flex gap-3 pt-5 mt-4 border-t border-variable">
                <button onClick={onClose} className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-variable-main transition-all">Cancelar</button>
                <div className="flex-1" />
                <button onClick={submit} className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <CalendarPlus size={16} /> Ampliar
                </button>
            </div>
        </ModalShell>
    );
}
