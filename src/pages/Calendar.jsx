import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { X, Calendar as CalendarIcon, User, FolderOpen, AlignLeft, Clock } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

export default function Calendar() {
    const { profile } = useAuth();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [milestones, setMilestones] = useState([]);
    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null); // Si es null, estamos creando uno nuevo
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        project_id: '',
        assigned_to: '',
        status: 'pending',
        all_day: true,
        start_date: new Date(),
        end_date: new Date()
    });

    const formatDateTimeLocal = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const formatDateLocal = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    useEffect(() => {
        fetchData();

        // Suscripción a cambios
        const channel = supabase.channel('calendar-hitos')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'project_milestones' }, () => {
                fetchMilestones();
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchMilestones(), fetchProjects(), fetchUsers()]);
        setLoading(false);
    };

    const fetchMilestones = async () => {
        const { data, error } = await supabase
            .from('project_milestones')
            .select('*, projects(id, name), assigned_user:users!assigned_to(id, first_name, second_name)');

        if (error) {
            console.error('Error fetching milestones:', error);
            // Si la relación falla, intentar sin ella
            const { data: simpleData } = await supabase.from('project_milestones').select('*, projects(id, name)');
            setMilestones(simpleData || []);
        } else {
            setMilestones(data || []);
        }
    };

    const fetchProjects = async () => {
        const { data } = await supabase.from('projects').select('id, name').order('name');
        setProjects(data || []);
    };

    const fetchUsers = async () => {
        const { data } = await supabase.from('users').select('id, first_name, second_name').order('first_name');
        setUsers(data || []);
    };

    // Formatear eventos para FullCalendar
    const events = milestones.map(m => {
        // Soporte de compatibilidad con schema antiguo (target_date) vs nuevo (start_date/end_date)
        const start = m.start_date || m.target_date;
        const end = m.end_date || m.target_date;

        let color = '#3b82f6'; // Azul por defecto (Personal)
        if (m.project_id) color = '#f59e0b'; // Naranja si es de Proyecto
        if (m.status === 'completed') color = '#10b981'; // Verde si completado
        if (m.status === 'in_progress') color = '#8b5cf6'; // Morado en progreso

        return {
            id: m.id,
            title: m.title,
            start: start,
            end: m.all_day ? null : end,
            allDay: m.all_day ?? true,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { ...m }
        };
    });

    const handleDateSelect = (selectInfo) => {
        setFormData({
            title: '',
            description: '',
            project_id: '',
            assigned_to: profile?.id || '',
            status: 'pending',
            all_day: selectInfo.allDay,
            start_date: selectInfo.start,
            end_date: selectInfo.end
        });
        setSelectedEvent(null);
        setIsModalOpen(true);

        let calendarApi = selectInfo.view.calendar;
        calendarApi.unselect();
    };

    const handleEventClick = (clickInfo) => {
        const props = clickInfo.event.extendedProps;
        setFormData({
            title: props.title,
            description: props.description || '',
            project_id: props.project_id || '',
            assigned_to: props.assigned_to || '',
            status: props.status || 'pending',
            all_day: props.all_day ?? true,
            start_date: clickInfo.event.start,
            end_date: clickInfo.event.end || clickInfo.event.start
        });
        setSelectedEvent(clickInfo.event);
        setIsModalOpen(true);
    };

    const handleEventDropOrResize = async (dropInfo) => {
        const eventId = dropInfo.event.id;
        try {
            const { error } = await supabase
                .from('project_milestones')
                .update({
                    start_date: dropInfo.event.start.toISOString(),
                    end_date: dropInfo.event.end ? dropInfo.event.end.toISOString() : null,
                    all_day: dropInfo.event.allDay,
                    // Si el schema falla al no tener start_date, actualizamos target_date como backup
                    target_date: dropInfo.event.start.toISOString().split('T')[0]
                })
                .eq('id', eventId);

            if (error) throw error;
            showNotification('Hito movido correctamente');
        } catch (error) {
            console.error('Error moving event:', error);
            dropInfo.revert();
            // Mostrar error de migración si start_date no existe
            showNotification('Error al mover hito. ¿Has ejecutado el SQL?', 'error');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();

        await withLoading(async () => {
            try {
                const payload = {
                    title: formData.title,
                    description: formData.description,
                    project_id: formData.project_id || null,
                    assigned_to: formData.assigned_to || null,
                    status: formData.status,
                    all_day: formData.all_day,
                    start_date: new Date(formData.start_date).toISOString(),
                    end_date: new Date(formData.end_date).toISOString(),
                    target_date: new Date(formData.start_date).toISOString().split('T')[0] // Fallback
                };

                if (selectedEvent) {
                    const { error } = await supabase.from('project_milestones').update(payload).eq('id', selectedEvent.id);
                    if (error) throw error;
                    showNotification('Hito actualizado');
                } else {
                    const { error } = await supabase.from('project_milestones').insert([payload]);
                    if (error) throw error;
                    showNotification('Hito creado');
                }

                setIsModalOpen(false);
                fetchMilestones();
            } catch (error) {
                console.error('Error guardando hito:', error);
                showNotification('Error al guardar. Verifica la conexión.', 'error');
            }
        }, selectedEvent ? 'Actualizando hito...' : 'Creando hito...');
    };

    const handleDelete = async () => {
        if (!selectedEvent) return;
        const confirmed = await confirm({
            title: '¿Eliminar Hito?',
            message: '¿Estás seguro de que deseas eliminar este hito del calendario?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });
        if (!confirmed) return;

        await withLoading(async () => {
            try {
                const { error } = await supabase.from('project_milestones').delete().eq('id', selectedEvent.id);
                if (error) throw error;
                showNotification('Hito eliminado');
                setIsModalOpen(false);
                fetchMilestones();
            } catch (error) {
                console.error('Error al eliminar:', error);
            }
        }, 'Eliminando hito...');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-main)' }}>
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen font-display overflow-x-hidden flex" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' }}>
            <Sidebar />
            <div className="flex-1 p-4 sm:p-8 pb-32 md:pb-8 transition-all relative z-10 min-h-screen overflow-y-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-variable-main flex items-center gap-3">
                            <CalendarIcon size={32} className="text-primary" />
                            Calendario de Hitos
                        </h1>
                        <p className="text-sm text-variable-muted">Planifica fechas clave, reuniones y entregables.</p>
                    </div>
                    <button
                        onClick={() => {
                            setFormData({
                                title: '', description: '', project_id: '', assigned_to: profile?.id || '',
                                status: 'pending', all_day: true, start_date: new Date(), end_date: new Date()
                            });
                            setSelectedEvent(null);
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
                    >
                        + Nuevo Hito
                    </button>
                </div>

                {/* Layout Calendar */}
                <div className="glass p-3 sm:p-6 rounded-[1.5rem] sm:rounded-[2.5rem] border border-variable shadow-2xl relative z-20">
                    <style>
                        {`
                        /* ═══ BASE ═══ */
                        .fc {
                            --fc-page-bg-color: transparent;
                            --fc-neutral-bg-color: transparent;
                            --fc-today-bg-color: rgba(243, 121, 27, 0.08);
                        }

                        /* ═══ BOTONES (siempre naranja) ═══ */
                        .fc .fc-button-primary {
                            background-color: #f3791b !important;
                            border-color: #f3791b !important;
                            border-radius: 0.75rem;
                            font-weight: bold;
                            text-transform: capitalize;
                            color: #fff !important;
                            box-shadow: 0 2px 8px rgba(243,121,27,0.2);
                        }
                        .fc .fc-button-primary:hover { opacity: 0.9; }
                        .fc .fc-button-primary:not(:disabled).fc-button-active,
                        .fc .fc-button-primary:not(:disabled):active {
                            background-color: transparent !important;
                            border: 2px solid #f3791b !important;
                            color: #f3791b !important;
                            box-shadow: none;
                        }

                        /* ═══ TÍTULO DEL MES ═══ */
                        .fc-toolbar-title {
                            font-size: 1.5rem !important;
                            font-weight: 900;
                            text-transform: capitalize;
                        }

                        /* ═══ CABECERAS DE DÍA (lun, mar, mié...) — SIEMPRE NARANJA ═══ */
                        .fc .fc-col-header-cell {
                            background-color: rgba(243, 121, 27, 0.1) !important;
                        }
                        .fc-col-header-cell-cushion {
                            font-weight: 900 !important;
                            text-decoration: none !important;
                            color: #f3791b !important;
                            text-transform: uppercase;
                            font-size: 0.8rem;
                            letter-spacing: 0.06em;
                        }
                        .fc-col-header-cell-cushion:hover { text-decoration: none !important; }

                        /* ═══ NÚMEROS DE DÍA ═══ */
                        .fc-daygrid-day-number {
                            font-weight: bold !important;
                            text-decoration: none !important;
                        }
                        .fc-daygrid-day-number:hover { text-decoration: none !important; }

                        /* ═══ HOVER EN CELDAS ═══ */
                        .fc-daygrid-day { transition: background 0.2s; }
                        .fc-daygrid-day:hover { background: rgba(243,121,27,0.04) !important; }

                        /* ═══ EVENTOS ═══ */
                        .fc-event {
                            border-radius: 0.5rem;
                            padding: 2px 6px;
                            font-size: 0.75rem;
                            font-weight: bold;
                            border: none !important;
                            transition: transform 0.15s, filter 0.15s;
                            cursor: pointer;
                        }
                        .fc-event:hover { filter: brightness(1.15); transform: scale(1.02); }
                        .fc-h-event .fc-event-main { color: #fff !important; }

                        /* ═══ TIME GRID ═══ */
                        .fc-timegrid-slot { height: 3em !important; }
                        .fc .fc-more-link { color: #f3791b !important; font-weight: bold; }

                        /* ═══ MOBILE RESPONSIVE ═══ */
                        @media (max-width: 640px) {
                            .fc .fc-toolbar { flex-direction: column; gap: 0.5rem; }
                            .fc .fc-toolbar-title { font-size: 1rem !important; }
                            .fc .fc-button { font-size: 0.7rem !important; padding: 0.3rem 0.5rem !important; }
                            .fc .fc-col-header-cell-cushion { font-size: 0.65rem; }
                            .fc .fc-daygrid-day-number { font-size: 0.75rem !important; }
                        }

                        /* ═══════════════════════════════════ */
                        /* MODO OSCURO (por defecto)           */
                        /* ═══════════════════════════════════ */
                        .fc-theme-standard td,
                        .fc-theme-standard th,
                        .fc-theme-standard .fc-scrollgrid {
                            border-color: rgba(255, 255, 255, 0.12) !important;
                        }
                        .fc-toolbar-title { color: #ffffff !important; }
                        .fc-daygrid-day-number { color: #e5e7eb !important; }
                        .fc-timegrid-slot-label-cushion,
                        .fc-timegrid-axis-cushion { color: #9ca3af !important; }

                        /* ═══════════════════════════════════ */
                        /* MODO LIGHT                          */
                        /* ═══════════════════════════════════ */
                        .light .fc-theme-standard td,
                        .light .fc-theme-standard th,
                        .light .fc-theme-standard .fc-scrollgrid {
                            border-color: rgba(243, 121, 27, 0.25) !important;
                        }
                        .light .fc-toolbar-title { color: #1a1a1a !important; }
                        .light .fc-daygrid-day-number { color: #374151 !important; }
                        .light .fc .fc-col-header-cell {
                            background-color: rgba(243, 121, 27, 0.08) !important;
                        }
                        .light .fc-timegrid-slot-label-cushion,
                        .light .fc-timegrid-axis-cushion { color: #6b7280 !important; }
                        .light .fc-daygrid-day:hover { background: rgba(243,121,27,0.06) !important; }
                        .light .fc { --fc-today-bg-color: rgba(243, 121, 27, 0.06); }
                    `}
                    </style>
                    <FullCalendar
                        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                        headerToolbar={{
                            left: 'prev,next today',
                            center: 'title',
                            right: 'dayGridMonth,timeGridWeek,timeGridDay'
                        }}
                        initialView="dayGridMonth"
                        editable={true}
                        selectable={true}
                        selectMirror={true}
                        dayMaxEvents={true}
                        weekends={true}
                        locale={esLocale}
                        events={events}
                        select={handleDateSelect}
                        eventClick={handleEventClick}
                        eventDrop={handleEventDropOrResize}
                        eventResize={handleEventDropOrResize}
                        height="auto"
                        contentHeight="auto"
                        aspectRatio={1.35}
                    />
                </div>

                {/* Modal Crear/Editar */}
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[1.5rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">

                            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 text-variable-muted hover:text-white rounded-full hover:bg-white/10 transition-colors">
                                <X size={20} />
                            </button>

                            <h2 className="text-2xl font-black mb-6 flex items-center gap-3 text-variable-main">
                                <CalendarIcon size={24} className="text-primary" />
                                {selectedEvent ? 'Detalles del Hito' : 'Nuevo Hito'}
                            </h2>

                            <form onSubmit={handleSave} className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1 mb-1 block">Título *</label>
                                    <input required autoFocus value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-[#1a1321]/50 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 font-bold" placeholder="Reunión inicial, Entrega Fase 1..." />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1 mb-1 block">Inicio</label>
                                        <input type={formData.all_day ? "date" : "datetime-local"} value={formData.all_day ? formatDateLocal(formData.start_date) : formatDateTimeLocal(formData.start_date)} onChange={e => setFormData({ ...formData, start_date: e.target.value })} className="w-full bg-[#1a1321]/50 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1 mb-1 block">Fin</label>
                                        <input type={formData.all_day ? "date" : "datetime-local"} value={formData.all_day ? formatDateLocal(formData.end_date) : formatDateTimeLocal(formData.end_date)} onChange={e => setFormData({ ...formData, end_date: e.target.value })} className="w-full bg-[#1a1321]/50 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer pt-1 pb-2">
                                    <input type="checkbox" checked={formData.all_day} onChange={e => setFormData({ ...formData, all_day: e.target.checked })} className="accent-primary size-4" />
                                    <span className="text-sm text-variable-muted">Todo el día</span>
                                </label>

                                <div className="space-y-4 pt-2 border-t border-variable">
                                    <div className="flex items-center gap-3">
                                        <FolderOpen size={18} className="text-variable-muted" />
                                        <select value={formData.project_id} onChange={e => setFormData({ ...formData, project_id: e.target.value })} className="flex-1 bg-transparent border-none text-variable-main focus:outline-none text-sm font-bold">
                                            <option value="">Personal / General (Sin proyecto)</option>
                                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-4 py-2 border-t border-variable">
                                    <div className="flex items-center gap-3">
                                        <User size={18} className="text-variable-muted" />
                                        <select value={formData.assigned_to} onChange={e => setFormData({ ...formData, assigned_to: e.target.value })} className="flex-1 bg-transparent border-none text-variable-main focus:outline-none text-sm font-bold">
                                            <option value="">Sin asignar</option>
                                            {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.second_name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-2 border-t border-variable">
                                    <div className="flex gap-3">
                                        <AlignLeft size={18} className="text-variable-muted mt-2" />
                                        <textarea rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="flex-1 bg-[#1a1321]/50 border border-variable rounded-2xl px-4 py-3 text-variable-main focus:outline-none focus:border-primary/50 resize-none text-sm" placeholder="Descripción extra (opcional)..." />
                                    </div>
                                </div>

                                {selectedEvent && (
                                    <div className="flex gap-2">
                                        {['pending', 'in_progress', 'completed'].map(status => (
                                            <button type="button" key={status} onClick={() => setFormData({ ...formData, status })} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${formData.status === status ? 'bg-primary text-white border-primary' : 'bg-transparent text-variable-muted border-variable hover:border-primary/50'}`}>
                                                {status === 'pending' ? 'Pendiente' : status === 'in_progress' ? 'En Curso' : 'Completado'}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-3 pt-6 mt-4 border-t border-variable">
                                    {selectedEvent && (
                                        <button type="button" onClick={handleDelete} className="px-5 py-3 text-sm font-bold text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors">
                                            Eliminar
                                        </button>
                                    )}
                                    <button type="submit" className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95">
                                        Guardar
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </div>
        </div>
    );
}
