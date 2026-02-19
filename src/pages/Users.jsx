import React, { useState, useEffect } from 'react';
import {
    Users as UsersIcon,
    UserPlus,
    Mail,
    Shield,
    Trash2,
    Search,
    Clock,
    Sun,
    Moon,
    LayoutDashboard,
    FolderOpen,
    FileText,
    Settings,
    MoreVertical,
    CheckCircle2,
    X,
    ShieldCheck,
    UserCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

import Sidebar from '../components/Sidebar';

import { useAuth } from '../context/AuthContext';

export default function Users() {
    const { darkMode, toggleTheme } = useTheme();
    const { user: currentUser, profile: currentProfile } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [usersList, setUsersList] = useState([]);

    const [formData, setFormData] = useState({
        name: '',
        first_name: '',
        second_name: '',
        email: '',
        password: '',
        role: 'user'
    });

    const [fetchError, setFetchError] = useState(null);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Create auth user via Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
            });

            if (authError) throw authError;

            // 2. Insert profile into public.users table
            const { error: profileError } = await supabase
                .from('users')
                .insert({
                    id: authData.user.id,
                    email: formData.email,
                    name: formData.name,
                    first_name: formData.first_name,
                    second_name: formData.second_name,
                    role: formData.role,
                });

            if (profileError) throw profileError;

            // 3. Reset form and close modal
            setFormData({ name: '', first_name: '', second_name: '', email: '', password: '', role: 'user' });
            setIsModalOpen(false);
            fetchUsers(); // Refresh the list
        } catch (err) {
            console.error('Error creating user:', err);
            alert(`Error al crear usuario: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        // setLoading(true); // Don't show full loading spinner on background updates
        setFetchError(null);
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching users:', error);
            setFetchError(error);
        } else if (data) {
            setUsersList(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();

        // Realtime subscription
        const channel = supabase
            .channel('users-db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'users'
                },
                (payload) => {
                    console.log('Realtime change received!', payload);
                    // Optimized: we could just append/update local state, 
                    // but re-fetching is safer to ensure consistency with RLS policies
                    fetchUsers();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Suscrito a cambios en tiempo real de usuarios');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-10 overflow-y-auto">
                <header className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Gestión de Equipo</h1>
                        <p className="text-variable-muted">Configura los accesos y permisos de la plataforma</p>
                        {/* Debug Info */}
                        <div className="text-xs text-variable-muted mt-2 font-mono">
                            Debug: {currentUser?.email} | Rol: {currentProfile?.role || 'Sin Perfil'} |
                            Estado: {loading ? 'Cargando...' : 'Listo'}
                            {fetchError && <span className="text-rose-500 block">Error DB: {fetchError.message} - {fetchError.details}</span>}
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={fetchUsers}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                            title="Recargar Lista"
                        >
                            <Clock size={20} />
                        </button>
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                        >
                            <UserPlus size={20} /> Nuevo Miembro
                        </button>
                    </div>
                </header>

                <div className="glass rounded-[2.5rem] p-8">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="text-variable-muted text-xs uppercase tracking-[0.2em] font-bold border-b border-variable">
                                <tr>
                                    <th className="pb-6">Usuario</th>
                                    <th className="pb-6">Email Corporativo</th>
                                    <th className="pb-6 text-center">Rol de Acceso</th>
                                    <th className="pb-6">Fecha Registro</th>
                                    <th className="pb-6 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-variable">
                                {loading && usersList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="py-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="size-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                                <p className="text-variable-muted font-medium">Conectando con Supabase...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : usersList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="py-20 text-center">
                                            <div className="flex flex-col items-center gap-4 text-variable-muted">
                                                <UsersIcon size={40} className="opacity-20" />
                                                <p className="font-medium">No se encontraron miembros en la base de datos</p>
                                                <p className="text-xs italic">Asegúrate de haber configurado las políticas RLS en Supabase</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    usersList.map((user) => (
                                        <tr key={user.id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                                        <UserCircle size={20} />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-variable-main">{user.name}</p>
                                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{user.first_name} {user.second_name}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-6 text-variable-muted font-medium italic">{user.email}</td>
                                            <td className="py-6 text-center">
                                                <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${user.role === 'admin' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-sm shadow-rose-500/5' :
                                                    user.role === 'editor' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-sm shadow-blue-500/5' :
                                                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/5'
                                                    }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="py-6 text-variable-muted text-sm">{new Date(user.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                            <td className="py-6 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button className="p-2 text-variable-muted hover:text-primary transition-colors glass rounded-xl border-variable">
                                                        <Settings size={18} />
                                                    </button>
                                                    <button className="p-2 text-variable-muted hover:text-rose-500 transition-colors glass rounded-xl border-variable">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-lg glass rounded-[2.5rem] p-10 overflow-hidden shadow-2xl"
                        >
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-8 right-8 text-variable-muted hover:text-primary transition-colors">
                                <X size={24} />
                            </button>

                            <h2 className="text-3xl font-bold font-display mb-2 text-variable-main">Añadir Miembro</h2>
                            <p className="text-variable-muted mb-8 italic">Configura un nuevo acceso al panel administrativo</p>

                            <form onSubmit={handleCreateUser} className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre</label>
                                        <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-6 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Ej: Juan" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">1er Apellido</label>
                                        <input required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-6 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Ej: Pérez" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">2do Apellido</label>
                                    <input required value={formData.second_name} onChange={(e) => setFormData({ ...formData, second_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-6 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Ej: García" />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email de Empresa</label>
                                    <div className="relative">
                                        <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                        <input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-14 pr-6 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="juan.perez@automatizatelo.com" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Contraseña de acceso</label>
                                    <input required type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-6 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="••••••••" />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Privilegios</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {['user', 'editor', 'admin'].map((role) => (
                                            <button
                                                key={role}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, role })}
                                                className={`py-3 rounded-2xl font-bold text-[10px] uppercase transition-all border ${formData.role === role ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-variable text-variable-muted hover:border-primary/30'
                                                    }`}
                                            >
                                                {role}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-4 flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Procesando registro...' : <><ShieldCheck size={20} /> Dar de Alta</>}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
