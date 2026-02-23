import React, { useState, useEffect } from 'react';
import {
    Users as UsersIcon,
    UserPlus,
    Clock,
    Sun,
    Moon,
    X,
    ShieldCheck,
    Mail,
    Trash2,
    Settings,
    UserCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

export default function Users() {
    const { darkMode, toggleTheme } = useTheme();
    const { user: currentUser } = useAuth();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [usersList, setUsersList] = useState([]);
    const [fetchError, setFetchError] = useState(null);

    const defaultForm = {
        nombre: '',
        email: '',
        password: '',
        role: 'user'
    };
    const [formData, setFormData] = useState(defaultForm);

    const fetchUsers = async () => {
        setFetchError(null);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('fecha_creacion', { ascending: false });

            if (error) throw error;
            setUsersList(data || []);
        } catch (error) {
            console.error('Error fetching profiles:', error);
            setFetchError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        await withLoading(async () => {
            try {
                // En un entorno real, usaríamos una Edge Function o Admin Auth
                // Para este demo, intentamos crear el perfil directamente (asumiendo trigger o manual)
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: formData.email,
                    password: formData.password,
                    options: {
                        data: { nombre: formData.nombre }
                    }
                });

                if (authError) throw authError;

                showNotification('Usuario registrado. El perfil se creará automáticamente.');
                setFormData(defaultForm);
                setIsModalOpen(false);
                fetchUsers();
            } catch (err) {
                console.error('Error creating user:', err);
                showNotification(`Error: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }, 'Registrando usuario...');
    };

    const handleDeleteUser = async (user) => {
        if (user.id === currentUser?.id) {
            showNotification('No puedes eliminarte a ti mismo', 'error');
            return;
        }

        const confirmed = await confirm({
            title: '¿Eliminar Usuario?',
            message: `¿Estás seguro de que deseas eliminar a ${user.nombre}?`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });

        if (!confirmed) return;

        setLoading(true);
        try {
            const { error } = await supabase.from('profiles').delete().eq('id', user.id);
            if (error) throw error;
            showNotification('Usuario eliminado');
            fetchUsers();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        const channel = supabase.channel('profiles-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchUsers())
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Gestión de Usuarios</h1>
                        <p className="text-variable-muted">Administra el acceso y los roles del panel</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        <button onClick={fetchUsers} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            <Clock size={20} />
                        </button>
                        <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button onClick={() => setIsModalOpen(true)} className="flex-1 sm:flex-none bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                            <UserPlus size={20} /> <span>Añadir Miembro</span>
                        </button>
                    </div>
                </header>

                <DataTable
                    tableId="users"
                    loading={loading}
                    data={usersList}
                    rowKey="id"
                    columns={[
                        {
                            key: 'nombre',
                            label: 'Usuario',
                            render: (user) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                        <UserCircle size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{user.nombre}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{user.email}</p>
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: 'role',
                            label: 'Rol',
                            render: (user) => (
                                <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${user.role === 'admin' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                                    {user.role}
                                </span>
                            )
                        },
                        {
                            key: 'fecha_creacion',
                            label: 'Registro',
                            render: (user) => (
                                <span className="text-variable-muted text-sm">
                                    {new Date(user.fecha_creacion).toLocaleDateString('es-ES')}
                                </span>
                            )
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (user) => (
                                <div className="flex justify-end gap-2">
                                    <button className="p-2 text-variable-muted hover:text-primary transition-colors glass rounded-xl border-variable">
                                        <Settings size={18} />
                                    </button>
                                    <button onClick={() => handleDeleteUser(user)} className="p-2 text-variable-muted hover:text-rose-500 transition-colors glass rounded-xl border-variable">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            )
                        }
                    ]}
                />
            </main>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-lg glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl">
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-8 right-8 text-variable-muted hover:text-primary transition-colors"><X size={24} /></button>
                            <h2 className="text-3xl font-bold font-display mb-8 text-variable-main">Nuevo Miembro</h2>
                            <form onSubmit={handleCreateUser} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre</label>
                                    <input required value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Ej: Administrador" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email</label>
                                    <input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="email@ejemplo.com" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Contraseña</label>
                                    <input required type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="••••••••" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Rol</label>
                                    <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all">
                                        <option value="user">Usuario</option>
                                        <option value="admin">Administrador</option>
                                    </select>
                                </div>
                                <button disabled={loading} type="submit" className="w-full py-5 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-4 flex items-center justify-center gap-2">
                                    {loading ? 'Registrando...' : <><ShieldCheck size={20} /> Crear Acceso</>}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
