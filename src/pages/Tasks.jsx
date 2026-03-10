import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    ListTodo, Plus, ChevronDown, ChevronUp, ChevronRight, X,
    AlertCircle, Clock, CheckCircle2, Circle, Flame, ArrowUp,
    ArrowDown, Minus, MessageSquare, Paperclip, User, Calendar,
    FolderOpen, Filter, Search, Edit3, Trash2, Send, Flag,
    GitBranch, Tag, MoreHorizontal, Sun, Moon, RefreshCw,
    Zap, Target, Package, PlayCircle, Archive
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Sidebar from '../components/Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { useGlobalLoading } from '../context/LoadingContext';
import { useNotifications } from '../context/NotificationContext';

/* ─── Constantes ─── */
const PRIORITIES = [
    { value: 'Crítica', label: 'Crítica', icon: Flame, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' },
    { value: 'Alta', label: 'Alta', icon: ArrowUp, color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20' },
    { value: 'Media', label: 'Media', icon: Minus, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
    { value: 'Baja', label: 'Baja', icon: ArrowDown, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
];

const STATUSES = [
    { value: 'pending', label: 'Pendiente', icon: Circle, color: 'text-variable-muted', bg: 'bg-white/5 border-variable' },
    { value: 'in_progress', label: 'En Curso', icon: Clock, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
    { value: 'review', label: 'Revisión', icon: AlertCircle, color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20' },
    { value: 'done', label: 'Hecho', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
];

const getPriority = (v) => PRIORITIES.find(p => p.value === v) || PRIORITIES[2];
const getStatus = (v) => STATUSES.find(s => s.value === v) || STATUSES[0];

/* ─── Badge de prioridad ─── */
const PriorityBadge = ({ value, small = false }) => {
    const p = getPriority(value);
    const Icon = p.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${p.color} ${p.bg} ${small ? 'text-[9px]' : ''}`}>
            <Icon size={small ? 9 : 10} /> {p.label}
        </span>
    );
};

/* ─── Badge de estado ─── */
const StatusBadge = ({ value, small = false }) => {
    const s = getStatus(value);
    const Icon = s.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${s.color} ${s.bg} ${small ? 'text-[9px]' : ''}`}>
            <Icon size={small ? 9 : 10} /> {s.label}
        </span>
    );
};

/* ─── Avatar ─── */
const Avatar = ({ name, size = 7 }) => (
    <img
        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=f3791b&color=fff&size=64`}
        alt={name}
        className={`size-${size} rounded-full object-cover flex-shrink-0 border-2 border-primary/20`}
        title={name}
    />
);

/* ══════════════════════════════════════════════ */
/*  PANEL DETALLE DE TAREA                        */
/* ══════════════════════════════════════════════ */
function TaskDetailPanel({ task, onClose, projectUsers, currentProfile, onRefresh }) {
    const [subtasks, setSubtasks] = useState([]);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [newSubtask, setNewSubtask] = useState('');
    const [addingSubtask, setAddingSubtask] = useState(false);
    const [loading, setLoading] = useState(false);
    const [localTask, setLocalTask] = useState(task);
    const [editingAssignee, setEditingAssignee] = useState(false);
    const [savingAssignee, setSavingAssignee] = useState(false);

    const fetchDetails = useCallback(async () => {
        const [{ data: subs }, { data: coms }] = await Promise.all([
            supabase.from('task_subtasks').select('*').eq('task_id', task.id).order('created_at'),
            supabase.from('task_comments').select('*, users(full_name, avatar_url)').eq('task_id', task.id).order('created_at'),
        ]);
        setSubtasks(subs || []);
        setComments(coms || []);
    }, [task.id]);

    useEffect(() => { fetchDetails(); }, [fetchDetails]);

    const handleStatusChange = async (newStatus) => {
        const now = new Date().toISOString();
        // Guardar historial de cambio de estado para calcular duraciones
        await Promise.all([
            supabase.from('project_tasks').update({ status: newStatus, updated_at: now }).eq('id', task.id),
            supabase.from('task_status_logs').insert([{
                task_id: task.id,
                status: newStatus,
                changed_by: currentProfile?.id || null,
            }]).then(() => { }), // fire & forget, no bloquea
        ]);
        setLocalTask(t => ({ ...t, status: newStatus }));
        onRefresh();
    };

    const handleAssign = async (userId, userName) => {
        setSavingAssignee(true);
        await supabase.from('project_tasks').update({ assigned_to: userId || null }).eq('id', task.id);
        setLocalTask(t => ({ ...t, assigned_to: userId || null, assigned_name: userName || '' }));
        setEditingAssignee(false);
        setSavingAssignee(false);
        onRefresh();
    };

    const handleSelfAssign = () => {
        if (currentProfile) handleAssign(currentProfile.id, currentProfile.full_name);
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        setLoading(true);
        await supabase.from('task_comments').insert([{
            task_id: task.id,
            user_id: currentProfile?.id,
            content: newComment.trim(),
        }]);
        setNewComment('');
        fetchDetails();
        setLoading(false);
    };

    const handleAddSubtask = async () => {
        if (!newSubtask.trim()) return;
        await supabase.from('task_subtasks').insert([{
            task_id: task.id,
            title: newSubtask.trim(),
            status: 'pending',
        }]);
        setNewSubtask('');
        setAddingSubtask(false);
        fetchDetails();
    };

    const toggleSubtask = async (sub) => {
        const next = sub.status === 'done' ? 'pending' : 'done';
        await supabase.from('task_subtasks').update({ status: next }).eq('id', sub.id);
        fetchDetails();
    };

    const deleteSubtask = async (subId) => {
        await supabase.from('task_subtasks').delete().eq('id', subId);
        fetchDetails();
    };

    const deleteComment = async (comId) => {
        await supabase.from('task_comments').delete().eq('id', comId);
        fetchDetails();
    };

    const doneSubtasks = subtasks.filter(s => s.status === 'done').length;

    return (
        <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 right-0 w-full max-w-2xl z-[200] flex flex-col glass border-l border-variable shadow-2xl shadow-black/50 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-start gap-4 p-6 border-b border-variable flex-shrink-0">
                <button onClick={onClose} className="p-2 rounded-xl text-variable-muted hover:text-primary hover:bg-primary/10 transition-all mt-0.5">
                    <X size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] text-variable-muted font-bold uppercase tracking-widest">{localTask.project_name || 'Proyecto'}</span>
                        <ChevronRight size={10} className="text-variable-muted" />
                        <PriorityBadge value={localTask.priority} />
                        <StatusBadge value={localTask.status} />
                    </div>
                    <h2 className="text-xl font-black text-variable-main leading-tight">{localTask.title}</h2>
                </div>
            </div>

            {/* Body scroll */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* Status selector */}
                <div className="px-6 pt-5 pb-3">
                    <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest mb-3">Estado</p>
                    <div className="flex gap-2 flex-wrap">
                        {STATUSES.map(s => {
                            const Icon = s.icon;
                            const active = localTask.status === s.value;
                            return (
                                <button key={s.value} onClick={() => handleStatusChange(s.value)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${active ? s.bg + ' ' + s.color + ' scale-105' : 'border-variable text-variable-muted hover:border-primary/30'}`}>
                                    <Icon size={12} /> {s.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Meta info: Asignado + Creado */}
                <div className="px-6 py-3 grid grid-cols-2 gap-3">
                    {/* ── ASIGNADO A (editable) ── */}
                    <div className="p-3 rounded-xl bg-white/5 border border-variable relative">
                        <p className="text-[9px] text-variable-muted uppercase tracking-widest font-bold mb-2">Asignado a</p>
                        {!editingAssignee ? (
                            <div className="flex items-center gap-2 flex-wrap">
                                <Avatar name={localTask.assigned_name || '?'} size={6} />
                                <span className="text-xs font-bold text-variable-main flex-1 min-w-0 truncate">
                                    {localTask.assigned_name || 'Sin asignar'}
                                </span>
                                <button
                                    onClick={() => setEditingAssignee(true)}
                                    className="text-[9px] text-primary font-bold hover:underline flex-shrink-0"
                                    title="Cambiar asignado"
                                >
                                    {localTask.assigned_name ? 'Cambiar' : 'Asignar'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {/* Auto-asignarse */}
                                {currentProfile && localTask.assigned_to !== currentProfile.id && (
                                    <button
                                        onClick={handleSelfAssign}
                                        disabled={savingAssignee}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold hover:bg-primary/20 transition-all"
                                    >
                                        <Avatar name={currentProfile.full_name} size={4} />
                                        Asignarme a mí
                                    </button>
                                )}
                                {/* Selector de usuarios del proyecto */}
                                <select
                                    defaultValue={localTask.assigned_to || ''}
                                    onChange={e => {
                                        const u = projectUsers.find(u => u.id === e.target.value);
                                        handleAssign(e.target.value || null, u?.full_name || '');
                                    }}
                                    className="w-full bg-white/10 border border-primary/30 rounded-xl px-2 py-1.5 text-[10px] text-variable-main focus:outline-none"
                                    size={Math.min(projectUsers.length + 1, 5)}
                                >
                                    <option value="">Sin asignar</option>
                                    {projectUsers.map(u => (
                                        <option key={u.id} value={u.id}>{u.full_name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => setEditingAssignee(false)}
                                    className="text-[9px] text-variable-muted hover:text-primary font-bold"
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-variable">
                        <p className="text-[9px] text-variable-muted uppercase tracking-widest font-bold mb-1">Creado</p>
                        <p className="text-xs font-bold text-variable-main">
                            {localTask.created_at ? new Date(localTask.created_at).toLocaleDateString('es-ES') : '—'}
                        </p>
                    </div>
                </div>

                {/* Description */}
                {localTask.description && (
                    <div className="px-6 py-3">
                        <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest mb-2">Descripción</p>
                        <p className="text-sm text-variable-muted leading-relaxed">{localTask.description}</p>
                    </div>
                )}

                {/* Subtasks */}
                <div className="px-6 py-3 border-t border-variable">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest flex items-center gap-2">
                            <GitBranch size={11} /> Subtareas
                            {subtasks.length > 0 && (
                                <span className="text-primary font-black">{doneSubtasks}/{subtasks.length}</span>
                            )}
                        </p>
                        <button onClick={() => setAddingSubtask(true)} className="text-[10px] text-primary font-bold hover:underline flex items-center gap-1">
                            <Plus size={11} /> Añadir
                        </button>
                    </div>

                    {subtasks.length > 0 && (
                        <div className="w-full h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${subtasks.length ? (doneSubtasks / subtasks.length) * 100 : 0}%` }} />
                        </div>
                    )}

                    <div className="space-y-2">
                        {subtasks.map(sub => (
                            <div key={sub.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all group ${sub.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/20 opacity-70' : 'bg-white/5 border-variable'}`}>
                                <button onClick={() => toggleSubtask(sub)} className="flex-shrink-0">
                                    {sub.status === 'done'
                                        ? <CheckCircle2 size={16} className="text-emerald-500" />
                                        : <Circle size={16} className="text-variable-muted hover:text-primary transition-colors" />}
                                </button>
                                <span className={`flex-1 text-sm ${sub.status === 'done' ? 'line-through text-variable-muted' : 'text-variable-main'}`}>{sub.title}</span>
                                <button onClick={() => deleteSubtask(sub.id)} className="opacity-0 group-hover:opacity-100 p-1 text-variable-muted hover:text-rose-500 transition-all">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <AnimatePresence>
                        {addingSubtask && (
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-2 flex gap-2">
                                <input
                                    autoFocus
                                    value={newSubtask}
                                    onChange={e => setNewSubtask(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); if (e.key === 'Escape') setAddingSubtask(false); }}
                                    placeholder="Descripción de la subtarea…"
                                    className="flex-1 bg-white/10 border border-primary/30 rounded-xl px-3 py-2 text-sm text-variable-main focus:outline-none focus:border-primary placeholder:text-variable-muted/50"
                                />
                                <button onClick={handleAddSubtask} className="px-3 bg-primary text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all">✓</button>
                                <button onClick={() => setAddingSubtask(false)} className="px-3 bg-white/10 text-variable-muted rounded-xl text-xs hover:bg-white/20 transition-all">✕</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Comments / Activity */}
                <div className="px-6 py-3 border-t border-variable">
                    <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                        <MessageSquare size={11} /> Actividad ({comments.length})
                    </p>

                    <div className="space-y-4 mb-4">
                        {comments.map(c => (
                            <div key={c.id} className="flex gap-3 group">
                                <Avatar name={c.users?.full_name || '?'} size={7} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-variable-main">{c.users?.full_name || 'Usuario'}</span>
                                        <span className="text-[10px] text-variable-muted">{new Date(c.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5 border border-variable text-sm text-variable-muted leading-relaxed">
                                        {c.content}
                                    </div>
                                </div>
                                {(c.user_id === currentProfile?.id) && (
                                    <button onClick={() => deleteComment(c.id)} className="opacity-0 group-hover:opacity-100 p-1 text-variable-muted hover:text-rose-500 transition-all flex-shrink-0">
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {comments.length === 0 && (
                            <p className="text-xs text-variable-muted italic text-center py-4">Sin actividad aún. ¡Sé el primero en comentar!</p>
                        )}
                    </div>

                    {/* Add comment */}
                    <div className="flex gap-3 items-end">
                        <Avatar name={currentProfile?.full_name || '?'} size={8} />
                        <div className="flex-1 flex gap-2">
                            <textarea
                                rows={2}
                                value={newComment}
                                onChange={e => setNewComment(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                                placeholder="Añade un comentario... (Enter para enviar)"
                                className="flex-1 bg-white/10 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-main focus:outline-none focus:border-primary resize-none placeholder:text-variable-muted/50 transition-all"
                            />
                            <button
                                onClick={handleAddComment}
                                disabled={loading || !newComment.trim()}
                                className="p-3 bg-primary text-white rounded-2xl hover:brightness-110 transition-all disabled:opacity-40 flex-shrink-0 self-end"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="h-8" />
            </div>
        </motion.div>
    );
}

/* ══════════════════════════════════════════════ */
/*  TARJETA DE TAREA                              */
/* ══════════════════════════════════════════════ */
function TaskCard({ task, onClick, onDragStart, onDragEnd, isDragging, sprints, onMoveToSprint, showSprintBadge }) {
    const p = getPriority(task.priority);
    const s = getStatus(task.status);
    const SIcon = s.icon;
    const [showSprintMenu, setShowSprintMenu] = useState(false);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; if (onDragStart) onDragStart(); }}
            onDragEnd={onDragEnd}
            onClick={onClick}
            className={`p-4 rounded-2xl bg-white/5 border border-variable hover:border-primary/40 hover:bg-primary/5 transition-all group hover:shadow-lg hover:shadow-primary/5 select-none ${isDragging ? 'cursor-grabbing opacity-40 scale-95' : 'cursor-grab'}`}
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-bold text-variable-main leading-snug group-hover:text-primary transition-colors line-clamp-2 flex-1">{task.title}</p>
                <SIcon size={14} className={`${s.color} flex-shrink-0 mt-0.5`} />
            </div>

            {task.description && (
                <p className="text-xs text-variable-muted line-clamp-2 mb-3 leading-relaxed">{task.description}</p>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <PriorityBadge value={task.priority} small />
                    {task.project_name && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-variable text-[9px] text-variable-muted font-bold">
                            <FolderOpen size={8} /> {task.project_name}
                        </span>
                    )}
                </div>
                {task.assigned_name && <Avatar name={task.assigned_name} size={6} />}
            </div>

            {task.subtask_count > 0 && (
                <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(task.done_subtask_count / task.subtask_count) * 100}%` }} />
                    </div>
                    <span className="text-[9px] text-variable-muted font-bold">{task.done_subtask_count}/{task.subtask_count}</span>
                </div>
            )}

            {/* Sprint assignment button */}
            {onMoveToSprint && (
                <div className="mt-3 relative" onClick={e => { e.stopPropagation(); e.preventDefault(); }}>
                    {!task.sprint_id ? (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSprintMenu(v => !v);
                                }}
                                className="w-full flex items-center justify-center gap-1 py-1.5 rounded-xl border border-dashed border-variable text-[9px] text-variable-muted hover:border-primary hover:text-primary transition-all font-bold active:scale-95 bg-white/5"
                            >
                                <Zap size={9} /> Añadir al sprint
                            </button>
                            {showSprintMenu && (
                                <div className="absolute bottom-full mb-1 left-0 right-0 z-[200] bg-[#1a1c1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[140px]">
                                    <div className="px-3 py-1.5 border-b border-white/5 bg-black/40 text-[8px] font-black text-variable-muted uppercase">Sprints Activos</div>
                                    {sprints.filter(sp => sp.status !== 'completed' && (!task.project_id || sp.project_id === task.project_id)).map(sp => (
                                        <button key={sp.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onMoveToSprint(task.id, sp.id);
                                                setShowSprintMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-variable-main hover:bg-primary/20 hover:text-primary transition-all flex items-center gap-2"
                                        >
                                            <Zap size={10} className={sp.status === 'active' ? 'text-amber-500' : 'text-variable-muted'} />
                                            {sp.name}
                                        </button>
                                    ))}
                                    {sprints.filter(sp => sp.status !== 'completed' && (!task.project_id || sp.project_id === task.project_id)).length === 0 && (
                                        <p className="px-3 py-2 text-[10px] text-variable-muted italic">No hay sprints para este proyecto</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[9px] text-primary font-black flex items-center gap-1 italic">
                                <Zap size={9} /> {sprints.find(sp => sp.id === task.sprint_id)?.name || 'Sprint'}
                            </span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onMoveToSprint(task.id, null);
                                }}
                                className="text-[9px] text-variable-muted hover:text-red-400 transition-colors font-bold p-1"
                            >
                                ✕ Quitar
                            </button>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}

/* ══════════════════════════════════════════════ */
/*  PÁGINA PRINCIPAL                              */
/* ══════════════════════════════════════════════ */
export default function Tasks() {
    const { profile: currentProfile } = useAuth();
    const { darkMode, toggleTheme } = useTheme();
    const { withLoading } = useGlobalLoading();
    const { showNotification, confirm } = useNotifications();

    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState('');
    const [filterProject, setFilterProject] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterAssignee, setFilterAssignee] = useState('all');
    const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'list'

    // Sprints
    const [sprints, setSprints] = useState([]);
    const [activeSprint, setActiveSprint] = useState('backlog'); // 'backlog' | sprint.id
    const [showSprintModal, setShowSprintModal] = useState(false);
    const [newSprint, setNewSprint] = useState({ name: '', goal: '', start_date: '', end_date: '', project_id: '' });
    const [creatingS, setCreatingS] = useState(false);

    // Selected task
    const [selectedTask, setSelectedTask] = useState(null);

    // Drag & Drop Kanban
    const [draggedTaskId, setDraggedTaskId] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);

    const handleDragStart = (taskId) => setDraggedTaskId(taskId);
    const handleDragEnd = () => { setDraggedTaskId(null); setDragOverCol(null); };
    const handleDragOver = (e, colValue) => { e.preventDefault(); setDragOverCol(colValue); };
    const handleDrop = async (e, colValue) => {
        e.preventDefault();
        if (!draggedTaskId || colValue === undefined) return;
        const task = tasks.find(t => t.id === draggedTaskId);
        if (!task || task.status === colValue) { handleDragEnd(); return; }
        // Optimistic update
        setTasks(prev => prev.map(t => t.id === draggedTaskId ? { ...t, status: colValue } : t));
        handleDragEnd();
        await supabase.from('project_tasks').update({ status: colValue }).eq('id', draggedTaskId);
        // Log del cambio de estado
        await supabase.from('task_status_logs').insert([{ task_id: draggedTaskId, status: colValue }]);
    };

    // New task modal
    const [showNewModal, setShowNewModal] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'Media', status: 'pending', project_id: '', assigned_to: '' });
    const [creating, setCreating] = useState(false);

    /* ─── Fetch ─── */
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: projs }, { data: usrs }, { data: rawTasks }, { data: subtaskCounts }, { data: sprintData }] = await Promise.all([
                supabase.from('projects').select('id, name, id_alias').order('name'),
                supabase.from('users').select('id, first_name, second_name, avatar_url').order('first_name'),
                supabase.from('project_tasks').select('*').order('created_at', { ascending: false }),
                supabase.from('task_subtasks').select('task_id, status'),
                supabase.from('project_sprints').select('*').order('created_at', { ascending: false }),
            ]);

            setProjects(projs || []);
            setSprints(sprintData || []);

            const normalizedUsers = (usrs || []).map(u => ({
                ...u,
                full_name: [u.first_name, u.second_name].filter(Boolean).join(' ') || 'Usuario',
            }));
            setUsers(normalizedUsers);

            const userMap = {};
            normalizedUsers.forEach(u => { userMap[u.id] = u.full_name; });
            const projMap = {};
            (projs || []).forEach(p => { projMap[p.id] = p.name; });

            const countMap = {};
            (subtaskCounts || []).forEach(s => {
                if (!countMap[s.task_id]) countMap[s.task_id] = { total: 0, done: 0 };
                countMap[s.task_id].total++;
                if (s.status === 'done') countMap[s.task_id].done++;
            });

            const enriched = (rawTasks || []).map(t => ({
                ...t,
                project_name: projMap[t.project_id] || '',
                assigned_name: userMap[t.assigned_to] || '',
                subtask_count: countMap[t.id]?.total || 0,
                done_subtask_count: countMap[t.id]?.done || 0,
            }));
            setTasks(enriched);
        } catch (e) {
            console.error('Error fetching tasks:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    /* ─── IDs de sprints completados (para ocultar tareas "done" de ellos) ─── */
    const completedSprintIds = sprints.filter(s => s.status === 'completed').map(s => s.id);

    /* ─── Filtrado ─── */
    const filtered = tasks.filter(t => {
        // Ocultar tareas "done" de sprints completados
        if (t.status === 'done' && t.sprint_id && completedSprintIds.includes(t.sprint_id)) return false;
        if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.project_name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterProject !== 'all' && t.project_id !== filterProject) return false;
        if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (filterAssignee !== 'all' && t.assigned_to !== filterAssignee) return false;
        // Sprint filter
        if (activeSprint === 'backlog') return !t.sprint_id;
        if (activeSprint !== 'all') return t.sprint_id === activeSprint;
        return true;
    });

    /* ─── Crear tarea (asignar sprint si hay uno activo) ─── */
    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newTask.title.trim() || !newTask.project_id) return;
        setCreating(true);
        await withLoading(async () => {
            const sprintId = newTask.sprint_id || ((activeSprint !== 'backlog' && activeSprint !== 'all') ? activeSprint : null);
            const payload = {
                title: newTask.title.trim(),
                description: newTask.description.trim() || null,
                priority: newTask.priority,
                status: newTask.status,
                project_id: newTask.project_id,
                assigned_to: newTask.assigned_to || null,
                sprint_id: sprintId || null,
            };
            await supabase.from('project_tasks').insert([payload]);
            setShowNewModal(false);
            setNewTask({ title: '', description: '', priority: 'Media', status: 'pending', project_id: '', assigned_to: '', sprint_id: '' });
            setCreating(false);
            fetchData();
        }, 'Creando tarea...');
    };

    /* ─── Crear sprint ─── */
    const handleCreateSprint = async (e) => {
        e.preventDefault();
        if (!newSprint.name.trim() || !newSprint.project_id) return;
        setCreatingS(true);

        await withLoading(async () => {
            try {
                const payload = {
                    name: newSprint.name.trim(),
                    goal: newSprint.goal.trim() || null,
                    start_date: newSprint.start_date || null,
                    end_date: newSprint.end_date || null,
                    project_id: newSprint.project_id,
                    status: 'planning',
                };

                // Clean empty strings
                if (payload.start_date === '') payload.start_date = null;
                if (payload.end_date === '') payload.end_date = null;

                const { error } = await supabase.from('project_sprints').insert([payload]);

                if (error) {
                    console.error('Supabase error:', error);
                    throw error;
                }

                setShowSprintModal(false);
                setNewSprint({ name: '', goal: '', start_date: '', end_date: '', project_id: '' });
                fetchData();
            } catch (err) {
                console.error('Detailed error:', err);
                await confirm({
                    title: 'Error al crear Sprint',
                    message: err.message || 'Error desconocido',
                    confirmText: 'Entendido',
                    cancelText: ''
                });
            } finally {
                setCreatingS(false);
            }
        }, 'Creando sprint...');
    };

    /* ─── Mover tarea al sprint activo desde Backlog ─── */
    const handleMoveToSprint = async (taskId, sprintId) => {
        await supabase.from('project_tasks').update({ sprint_id: sprintId || null }).eq('id', taskId);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, sprint_id: sprintId || null } : t));
    };

    /* ─── Eliminar tarea ─── */
    const handleDelete = async (taskId) => {
        const confirmed = await confirm({
            title: '¿Eliminar Tarea?',
            message: '¿Estás seguro de que deseas eliminar esta tarea? Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });
        if (!confirmed) return;

        await supabase.from('project_tasks').delete().eq('id', taskId);
        setSelectedTask(null);
        fetchData();
    };

    /* ─── Stats ─── */
    const currentSprintObj = sprints.find(s => s.id === activeSprint);
    const daysLeft = currentSprintObj?.end_date
        ? Math.ceil((new Date(currentSprintObj.end_date) - new Date()) / 86400000)
        : null;

    const stats = {
        total: filtered.length,
        pending: filtered.filter(t => t.status === 'pending').length,
        inProgress: filtered.filter(t => t.status === 'in_progress').length,
        done: filtered.filter(t => t.status === 'done').length,
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-8 overflow-y-auto pb-32 md:pb-8 custom-scrollbar">
                {/* ─── Header ─── */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2.5 bg-primary/10 rounded-2xl text-primary">
                                <ListTodo size={22} />
                            </div>
                            <h1 className="text-3xl font-black text-variable-main tracking-tight">Tareas &amp; Sprints</h1>
                        </div>
                        <p className="text-sm text-variable-muted ml-12">Gestor de tareas al estilo Jira</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <button onClick={fetchData} className="p-2.5 sm:p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all" title="Refrescar">
                            <RefreshCw size={18} />
                        </button>
                        <button onClick={toggleTheme} className="p-2.5 sm:p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button onClick={() => setShowSprintModal(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 glass border border-primary/30 text-primary rounded-2xl font-bold text-xs sm:text-sm hover:bg-primary/10 transition-all">
                            <Zap size={15} /> <span className="hidden sm:inline">Nuevo</span> Sprint
                        </button>
                        <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-primary text-white rounded-2xl font-bold text-xs sm:text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                            <Plus size={16} /> <span className="hidden sm:inline">Nueva</span> Tarea
                        </button>
                    </div>
                </div>

                {/* ─── Sprint selector bar ─── */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar no-scrollbar-on-mobile">
                    <button onClick={() => setActiveSprint('all')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${activeSprint === 'all' ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'glass border-variable text-variable-muted hover:border-primary/50'
                            }`}>
                        <Package size={14} /> Todas las tareas
                    </button>
                    <button onClick={() => setActiveSprint('backlog')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${activeSprint === 'backlog' ? 'bg-gray-700 text-white border-gray-600 shadow-lg shadow-gray-700/20' : 'glass border-variable text-variable-muted hover:border-primary/50'
                            }`}>
                        <Archive size={14} /> Backlog ({tasks.filter(t => !t.sprint_id).length})
                    </button>
                    <div className="w-px h-8 bg-variable mx-1 flex-shrink-0" />
                    {sprints.filter(sp => (filterProject === 'all' || sp.project_id === filterProject) && sp.status !== 'completed').map(sp => {
                        const isActive = activeSprint === sp.id;
                        return (
                            <button key={sp.id} onClick={() => setActiveSprint(sp.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${isActive ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'glass border-variable text-variable-muted hover:border-primary/50'
                                    }`}>
                                <Zap size={14} className={sp.status === 'active' ? 'text-amber-400' : ''} />
                                {sp.name}
                            </button>
                        );
                    })}
                </div>

                {/* Info del sprint activo */}
                {currentSprintObj && (
                    <div className="glass rounded-2xl p-3 sm:p-4 mb-4 flex flex-wrap items-center gap-2 sm:gap-4 border border-primary/20">
                        <div className="p-2 bg-primary/10 rounded-xl text-primary"><Target size={16} /></div>
                        <div className="flex-1 min-w-[120px]">
                            <p className="text-xs font-black text-variable-main">{currentSprintObj.name}</p>
                            {currentSprintObj.goal && <p className="text-[10px] text-variable-muted line-clamp-1">{currentSprintObj.goal}</p>}
                        </div>
                        {currentSprintObj.start_date && (
                            <span className="text-[10px] text-variable-muted font-bold hidden sm:inline">
                                {new Date(currentSprintObj.start_date).toLocaleDateString('es-ES')} — {new Date(currentSprintObj.end_date).toLocaleDateString('es-ES')}
                            </span>
                        )}
                        {daysLeft !== null && (
                            <span className={`text-[10px] sm:text-xs font-black px-2 sm:px-3 py-1 rounded-xl ${daysLeft < 0 ? 'bg-red-500/20 text-red-400' : daysLeft <= 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                {daysLeft < 0 ? `${Math.abs(daysLeft)}d atrás` : `${daysLeft}d`}
                            </span>
                        )}
                        <button onClick={async () => {
                            if (currentSprintObj.status === 'active') {
                                const sprintTasks = tasks.filter(t => t.sprint_id === currentSprintObj.id);
                                const incomplete = sprintTasks.filter(t => t.status !== 'done');
                                if (incomplete.length > 0) {
                                    await confirm({
                                        title: 'Pendientes',
                                        message: `No se puede completar el sprint. Aún hay ${incomplete.length} tareas pendientes (debes moverlas a "Hecho" o al Backlog/otro Sprint).`,
                                        confirmText: 'Entendido',
                                        cancelText: ''
                                    });
                                    return;
                                }
                            }
                            const next = currentSprintObj.status === 'planning' ? 'active' : 'completed';
                            await supabase.from('project_sprints').update({ status: next }).eq('id', currentSprintObj.id);
                            fetchData();
                        }} className="text-[10px] font-bold text-primary hover:underline whitespace-nowrap">
                            {currentSprintObj.status === 'planning' ? '▶ Iniciar' : currentSprintObj.status === 'active' ? '✓ Completar' : null}
                        </button>
                    </div>
                )}

                {/* ─── Stats cards ─── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total', value: stats.total, color: 'text-variable-main', bg: 'bg-white/5' },
                        { label: 'Pendientes', value: stats.pending, color: 'text-variable-muted', bg: 'bg-white/5' },
                        { label: 'En Curso', value: stats.inProgress, color: 'text-primary', bg: 'bg-primary/10' },
                        { label: 'Completadas', value: stats.done, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    ].map(s => (
                        <div key={s.label} className={`p-4 rounded-2xl ${s.bg} border border-variable`}>
                            <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest mb-1">{s.label}</p>
                            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* ─── Filters ─── */}
                <div className="glass rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-variable-muted" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar tareas..."
                            className="w-full bg-white/5 border border-variable rounded-xl pl-9 pr-4 py-2 text-sm text-variable-main focus:outline-none focus:border-primary placeholder:text-variable-muted/50"
                        />
                    </div>
                    <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="text-xs rounded-xl px-3 py-2 !border-variable !bg-transparent min-w-[140px]">
                        <option value="all">Todos los proyectos</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="text-xs rounded-xl px-3 py-2 !border-variable !bg-transparent">
                        <option value="all">Todas las prioridades</option>
                        {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-xs rounded-xl px-3 py-2 !border-variable !bg-transparent">
                        <option value="all">Todos los estados</option>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="text-xs rounded-xl px-3 py-2 !border-variable !bg-transparent">
                        <option value="all">Todos los asignados</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                    {/* View mode toggle */}
                    <div className="flex items-center gap-1 glass rounded-xl p-1 ml-auto">
                        {['kanban', 'list'].map(m => (
                            <button key={m} onClick={() => setViewMode(m)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === m ? 'bg-primary text-white' : 'text-variable-muted hover:text-primary'}`}>
                                {m === 'kanban' ? '⊞ Kanban' : '≡ Lista'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Loading ─── */}
                {loading && (
                    <div className="flex items-center justify-center py-24">
                        <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    </div>
                )}

                {/* ─── Kanban View ─── */}
                {!loading && viewMode === 'kanban' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {STATUSES.map(col => {
                            const colTasks = filtered.filter(t => t.status === col.value);
                            const ColIcon = col.icon;
                            const isDragOver = dragOverCol === col.value;
                            return (
                                <div
                                    key={col.value}
                                    className="flex flex-col gap-3"
                                    onDragOver={e => handleDragOver(e, col.value)}
                                    onDrop={e => handleDrop(e, col.value)}
                                    onDragLeave={() => setDragOverCol(null)}
                                >
                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all ${isDragOver ? col.bg + ' scale-[1.02] shadow-lg' : col.bg}`}>
                                        <ColIcon size={14} className={col.color} />
                                        <span className={`text-xs font-black uppercase tracking-widest ${col.color}`}>{col.label}</span>
                                        <span className="ml-auto text-[10px] font-black text-variable-muted bg-black/20 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                                    </div>
                                    <div className={`flex flex-col gap-3 min-h-[120px] rounded-2xl transition-all p-1 ${isDragOver ? 'bg-primary/5 border-2 border-dashed border-primary/30' : ''}`}>
                                        <AnimatePresence>
                                            {colTasks.map(t => (
                                                <TaskCard
                                                    key={t.id}
                                                    task={t}
                                                    onClick={() => { if (!draggedTaskId) setSelectedTask(t); }}
                                                    onDragStart={() => handleDragStart(t.id)}
                                                    onDragEnd={handleDragEnd}
                                                    isDragging={draggedTaskId === t.id}
                                                    sprints={sprints}
                                                    onMoveToSprint={handleMoveToSprint}
                                                />
                                            ))}
                                        </AnimatePresence>
                                        {colTasks.length === 0 && !isDragOver && (
                                            <div className="border-2 border-dashed border-variable rounded-2xl p-6 text-center">
                                                <p className="text-xs text-variable-muted">Sin tareas</p>
                                            </div>
                                        )}
                                        {isDragOver && (
                                            <div className="border-2 border-dashed border-primary/40 rounded-2xl p-4 text-center bg-primary/5">
                                                <p className="text-xs text-primary font-bold">Soltar aquí</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ─── List View ─── */}
                {!loading && viewMode === 'list' && (
                    <div className="glass rounded-3xl overflow-hidden">
                        <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-variable-muted border-b border-variable">
                            <div className="col-span-5">Tarea</div>
                            <div className="col-span-2">Proyecto</div>
                            <div className="col-span-2">Estado</div>
                            <div className="col-span-2">Prioridad</div>
                            <div className="col-span-1">Asignado</div>
                        </div>
                        <div className="divide-y divide-variable">
                            <AnimatePresence>
                                {filtered.map(t => (
                                    <motion.div
                                        key={t.id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        onClick={() => setSelectedTask(t)}
                                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center px-6 py-4 hover:bg-primary/5 cursor-pointer transition-all group"
                                    >
                                        <div className="sm:col-span-5">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-sm font-bold text-variable-main group-hover:text-primary transition-colors line-clamp-1">{t.title}</p>
                                                {t.sprint_id && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[8px] text-primary font-black flex items-center gap-1">
                                                        <Zap size={8} /> {sprints.find(s => s.id === t.sprint_id)?.name}
                                                    </span>
                                                )}
                                            </div>
                                            {t.description && <p className="text-xs text-variable-muted line-clamp-1 mt-0.5">{t.description}</p>}
                                            {t.subtask_count > 0 && (
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(t.done_subtask_count / t.subtask_count) * 100}%` }} />
                                                    </div>
                                                    <span className="text-[9px] text-variable-muted">{t.done_subtask_count}/{t.subtask_count}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <span className="text-xs text-variable-muted font-bold">{t.project_name || '—'}</span>
                                        </div>
                                        <div className="sm:col-span-2"><StatusBadge value={t.status} /></div>
                                        <div className="sm:col-span-2"><PriorityBadge value={t.priority} /></div>
                                        <div className="sm:col-span-1 flex justify-end sm:justify-start items-center gap-3">
                                            {t.assigned_name ? <Avatar name={t.assigned_name} size={7} /> : <span className="text-xs text-variable-muted">—</span>}
                                            <div className="relative group/menu" onClick={e => e.stopPropagation()}>
                                                <button className="p-1.5 text-variable-muted hover:text-primary transition-colors glass rounded-lg">
                                                    <Zap size={14} />
                                                </button>
                                                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-variable rounded-xl shadow-2xl overflow-hidden hidden group-hover/menu:block z-[200]">
                                                    <p className="px-3 py-2 text-[10px] font-black text-variable-muted uppercase border-b border-variable bg-black/20">Asignar a Sprint</p>
                                                    <button onClick={() => handleMoveToSprint(t.id, null)} className="w-full text-left px-3 py-2 text-xs font-bold text-variable-muted hover:bg-white/5 flex items-center gap-2">
                                                        <Archive size={10} /> Backlog
                                                    </button>
                                                    {sprints.filter(sp => sp.status !== 'completed').map(sp => (
                                                        <button key={sp.id} onClick={() => handleMoveToSprint(t.id, sp.id)} className="w-full text-left px-3 py-2 text-xs font-bold text-variable-main hover:bg-primary/10 hover:text-primary flex items-center gap-2">
                                                            <Zap size={10} className="text-amber-500" /> {sp.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {filtered.length === 0 && (
                                <div className="py-16 text-center">
                                    <ListTodo size={36} className="mx-auto text-variable-muted mb-3 opacity-30" />
                                    <p className="text-sm text-variable-muted">No hay tareas que coincidan con los filtros.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* ─── Panel Detalle (drawer) ─── */}
            <AnimatePresence>
                {selectedTask && (() => {
                    // Usuarios miembros del proyecto de la tarea seleccionada
                    // Si no hay project_members data, usamos todos los usuarios como fallback
                    const taskProjectUsers = users; // todos ya cargados; se puede filtrar más adelante
                    return (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-black/40 z-[190] backdrop-blur-[2px]"
                                onClick={() => setSelectedTask(null)}
                            />
                            <TaskDetailPanel
                                task={selectedTask}
                                onClose={() => setSelectedTask(null)}
                                projectUsers={taskProjectUsers}
                                currentProfile={currentProfile}
                                onRefresh={fetchData}
                            />
                        </>
                    );
                })()}
            </AnimatePresence>

            {/* ─── Modal Nueva Tarea ─── */}
            <AnimatePresence>
                {showNewModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                        onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-lg glass rounded-3xl p-8 border border-variable shadow-2xl shadow-black/60"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-black text-variable-main">Nueva Tarea</h2>
                                <button onClick={() => setShowNewModal(false)} className="p-2 rounded-xl text-variable-muted hover:text-primary hover:bg-primary/10 transition-all">
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Título *</label>
                                    <input value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} placeholder="Ej: Diseñar landing page de producto" required
                                        className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-main focus:outline-none focus:border-primary placeholder:text-variable-muted/50" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Descripción</label>
                                    <textarea rows={3} value={newTask.description} onChange={e => setNewTask(t => ({ ...t, description: e.target.value }))} placeholder="Descripción detallada de la tarea..."
                                        className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-main focus:outline-none focus:border-primary resize-none placeholder:text-variable-muted/50" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Proyecto *</label>
                                        <select value={newTask.project_id} onChange={e => setNewTask(t => ({ ...t, project_id: e.target.value }))} required className="w-full text-sm py-2.5">
                                            <option value="">Seleccionar...</option>
                                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Asignado a</label>
                                        <select value={newTask.assigned_to} onChange={e => setNewTask(t => ({ ...t, assigned_to: e.target.value }))} className="w-full text-sm py-2.5">
                                            <option value="">Sin asignar</option>
                                            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Prioridad</label>
                                        <select value={newTask.priority} onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))} className="w-full text-sm py-2.5">
                                            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Estado</label>
                                        <select value={newTask.status} onChange={e => setNewTask(t => ({ ...t, status: e.target.value }))} className="w-full text-sm py-2.5">
                                            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Sprint</label>
                                    <select value={newTask.sprint_id || ''} onChange={e => setNewTask(t => ({ ...t, sprint_id: e.target.value }))} className="w-full text-sm py-2.5">
                                        <option value="">Backlog (Sin sprint)</option>
                                        {sprints.filter(sp => sp.status !== 'completed' && (!newTask.project_id || sp.project_id === newTask.project_id)).map(sp => (
                                            <option key={sp.id} value={sp.id}>{sp.name} ({sp.status === 'active' ? 'Activo' : 'Planificación'})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setShowNewModal(false)} className="flex-1 py-3 glass rounded-2xl text-variable-muted font-bold text-sm hover:text-primary transition-all">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={creating || !newTask.title.trim() || !newTask.project_id}
                                        className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-40 shadow-lg shadow-primary/20">
                                        {creating ? 'Creando...' : 'Crear Tarea'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Modal Nuevo Sprint ─── */}
            <AnimatePresence>
                {showSprintModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                        onClick={e => { if (e.target === e.currentTarget) setShowSprintModal(false); }}
                    >
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md glass rounded-3xl p-8 shadow-2xl"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-primary/10 rounded-xl text-primary"><Zap size={18} /></div>
                                <div>
                                    <h3 className="text-xl font-black text-variable-main">Nuevo Sprint</h3>
                                    <p className="text-xs text-variable-muted">Iteración de trabajo acotada</p>
                                </div>
                                <button onClick={() => setShowSprintModal(false)} className="ml-auto p-2 text-variable-muted hover:text-primary rounded-xl transition-all"><X size={16} /></button>
                            </div>
                            <form onSubmit={handleCreateSprint} className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Nombre del Sprint *</label>
                                    <input required value={newSprint.name} onChange={e => setNewSprint(s => ({ ...s, name: e.target.value }))}
                                        placeholder="Ej: Sprint 1 — MVP" className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-main focus:outline-none focus:border-primary" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Objetivo</label>
                                    <input value={newSprint.goal} onChange={e => setNewSprint(s => ({ ...s, goal: e.target.value }))}
                                        placeholder="¿Qué queremos conseguir en este sprint?" className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-main focus:outline-none focus:border-primary" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Proyecto *</label>
                                    <select required value={newSprint.project_id} onChange={e => setNewSprint(s => ({ ...s, project_id: e.target.value }))} className="w-full text-sm py-2.5">
                                        <option value="">Seleccionar proyecto...</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Inicio</label>
                                        <input type="date" value={newSprint.start_date} onChange={e => setNewSprint(s => ({ ...s, start_date: e.target.value }))}
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-main focus:outline-none focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-variable-muted uppercase tracking-widest block mb-1.5">Fin</label>
                                        <input type="date" value={newSprint.end_date} onChange={e => setNewSprint(s => ({ ...s, end_date: e.target.value }))}
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-sm text-variable-main focus:outline-none focus:border-primary" />
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setShowSprintModal(false)} className="flex-1 py-3 glass rounded-2xl text-variable-muted font-bold text-sm hover:text-primary transition-all">Cancelar</button>
                                    <button type="submit" disabled={creatingS || !newSprint.name.trim() || !newSprint.project_id}
                                        className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-40 shadow-lg shadow-primary/20">
                                        {creatingS ? 'Creando...' : 'Crear Sprint'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
