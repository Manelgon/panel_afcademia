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
    UserCircle,
    Phone,
    MapPin,
    Calendar,
    Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

import Sidebar from '../components/Sidebar';
import CustomSelect from '../components/CustomSelect';
import DataTable from '../components/DataTable';

import { useAuth } from '../context/AuthContext';

export default function Users() {
    const { darkMode, toggleTheme } = useTheme();
    const { user: currentUser, profile: currentProfile } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [usersList, setUsersList] = useState([]);

    const defaultForm = {
        name: '', first_name: '', second_name: '',
        email: '', password: '', role: 'user',
        birth_date: '', phone_prefix: '+34', phone: '',
        country: 'España', province: '', city: '',
        address: '', status: 'active'
    };
    const [formData, setFormData] = useState(defaultForm);

    const [fetchError, setFetchError] = useState(null);

    // Prefijos telefónicos comunes
    const phonePrefixes = [
        { code: '+34', iso: 'ES' },
        { code: '+1', iso: 'US' },
        { code: '+44', iso: 'UK' },
        { code: '+33', iso: 'FR' },
        { code: '+49', iso: 'DE' },
        { code: '+39', iso: 'IT' },
        { code: '+351', iso: 'PT' },
        { code: '+52', iso: 'MX' },
        { code: '+54', iso: 'AR' },
        { code: '+57', iso: 'CO' },
        { code: '+56', iso: 'CL' },
        { code: '+55', iso: 'BR' },
    ];

    // Provincias de España
    const spanishProvinces = [
        'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila',
        'Badajoz', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria',
        'Castellón', 'Ciudad Real', 'Córdoba', 'A Coruña', 'Cuenca',
        'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca',
        'Illes Balears', 'Jaén', 'León', 'Lleida', 'Lugo', 'Madrid',
        'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Las Palmas',
        'Pontevedra', 'La Rioja', 'Salamanca', 'Segovia', 'Sevilla', 'Soria',
        'Tarragona', 'Santa Cruz de Tenerife', 'Teruel', 'Toledo', 'Valencia',
        'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla'
    ];

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
                    birth_date: formData.birth_date || null,
                    phone_prefix: formData.phone_prefix,
                    phone: formData.phone || null,
                    country: formData.country,
                    province: formData.province || null,
                    city: formData.city || null,
                    address: formData.address || null,
                    status: formData.status,
                });

            if (profileError) throw profileError;

            // 3. Reset form and close modal
            setFormData(defaultForm);
            setIsModalOpen(false);
            fetchUsers();
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

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Gestión de Equipo</h1>
                        <p className="text-variable-muted">Configura los accesos y permisos de la plataforma</p>
                        {/* Debug Info */}
                        <div className="text-xs text-variable-muted mt-2 font-mono">
                            Debug: {currentUser?.email} | Rol: {currentProfile?.role || 'Sin Perfil'} |
                            Estado: {loading ? 'Cargando...' : 'Listo'}
                            {fetchError && <span className="text-rose-500 block">Error DB: {fetchError.message} - {fetchError.details}</span>}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 w-full xs:w-auto">
                        <button
                            onClick={fetchUsers}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center justify-center"
                            title="Recargar Lista"
                        >
                            <Clock size={20} />
                        </button>
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center justify-center"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1 xs:flex-none bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                        >
                            <UserPlus size={20} /> <span className="whitespace-nowrap">Nuevo Miembro</span>
                        </button>
                    </div>
                </header>

                <DataTable
                    tableId="users"
                    loading={loading}
                    data={usersList}
                    rowKey="id"
                    defaultSort={{ key: 'created_at', dir: 'desc' }}
                    emptyIcon={<UsersIcon size={40} className="opacity-20" />}
                    emptyTitle="No se encontraron miembros en la base de datos"
                    emptySub="Asegúrate de haber configurado las políticas RLS en Supabase"
                    columns={[
                        {
                            key: 'name',
                            label: 'Usuario',
                            hideable: false,
                            render: (user) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                        <UserCircle size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{user.name}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{user.first_name} {user.second_name}</p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'email',
                            label: 'Email Corporativo',
                            render: (user) => (
                                <span className="text-variable-muted font-medium italic">{user.email}</span>
                            ),
                        },
                        {
                            key: 'role',
                            label: 'Rol de Acceso',
                            align: 'center',
                            render: (user) => (
                                <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${user.role === 'admin' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-sm shadow-rose-500/5' :
                                    user.role === 'editor' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-sm shadow-blue-500/5' :
                                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/5'
                                    }`}>
                                    {user.role}
                                </span>
                            ),
                        },
                        {
                            key: 'status',
                            label: 'Estado',
                            align: 'center',
                            render: (user) => (
                                <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${user.status === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/5'
                                    : user.status === 'banned'
                                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-sm shadow-rose-500/5'
                                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-sm shadow-amber-500/5'
                                    }`}>
                                    {user.status === 'active' ? 'Activo' : user.status === 'banned' ? 'Baneado' : user.status || '—'}
                                </span>
                            ),
                        },
                        {
                            key: 'phone',
                            label: 'Teléfono',
                            render: (user) => (
                                <span className="text-variable-muted text-sm font-medium whitespace-nowrap">
                                    {user.phone ? `${user.phone_prefix || ''} ${user.phone}` : <span className="italic opacity-50">—</span>}
                                </span>
                            ),
                        },
                        {
                            key: 'birth_date',
                            label: 'Nacimiento',
                            render: (user) => (
                                <span className="text-variable-muted text-sm">
                                    {user.birth_date
                                        ? new Date(user.birth_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : <span className="italic opacity-50">—</span>
                                    }
                                </span>
                            ),
                        },
                        {
                            key: 'country',
                            label: 'País',
                            render: (user) => (
                                <span className="text-variable-muted text-sm font-medium">
                                    {user.country || <span className="italic opacity-50">—</span>}
                                </span>
                            ),
                        },
                        {
                            key: 'province',
                            label: 'Provincia',
                            render: (user) => (
                                <span className="text-variable-muted text-sm">
                                    {user.province || <span className="italic opacity-50">—</span>}
                                </span>
                            ),
                        },
                        {
                            key: 'city',
                            label: 'Ciudad',
                            render: (user) => (
                                <span className="text-variable-muted text-sm">
                                    {user.city || <span className="italic opacity-50">—</span>}
                                </span>
                            ),
                        },
                        {
                            key: 'address',
                            label: 'Dirección',
                            render: (user) => (
                                <span className="text-variable-muted text-sm truncate max-w-[200px] inline-block">
                                    {user.address || <span className="italic opacity-50">—</span>}
                                </span>
                            ),
                        },
                        {
                            key: 'created_at',
                            label: 'Fecha Registro',
                            render: (user) => (
                                <span className="text-variable-muted text-sm">
                                    {new Date(user.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                            ),
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            sortable: false,
                            hideable: false,
                            render: (user) => (
                                <div className="flex justify-end gap-2">
                                    <button className="p-2 text-variable-muted hover:text-primary transition-colors glass rounded-xl border-variable">
                                        <Settings size={18} />
                                    </button>
                                    <button className="p-2 text-variable-muted hover:text-rose-500 transition-colors glass rounded-xl border-variable">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ),
                        },
                    ]}
                />
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
                            className="relative w-full max-w-2xl glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 overflow-y-auto max-h-[90vh] shadow-2xl"
                        >
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-variable-muted hover:text-primary transition-colors z-10">
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2 text-variable-main">Añadir Miembro</h2>
                            <p className="text-variable-muted mb-8 italic">Configura un nuevo acceso al panel administrativo</p>

                            <form onSubmit={handleCreateUser} className="space-y-5">
                                {/* --- Datos personales --- */}
                                <p className="text-xs font-black text-primary uppercase tracking-[0.2em] border-b border-variable pb-2">Datos Personales</p>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre</label>
                                        <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Juan" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">1er Apellido</label>
                                        <input required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="Pérez" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">2do Apellido</label>
                                        <input value={formData.second_name} onChange={(e) => setFormData({ ...formData, second_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all" placeholder="García" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Fecha de Nacimiento</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input type="date" value={formData.birth_date} onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Teléfono</label>
                                        <div className="flex gap-2">
                                            <CustomSelect
                                                value={formData.phone_prefix}
                                                onChange={(val) => setFormData({ ...formData, phone_prefix: val })}
                                                options={phonePrefixes.map((p) => ({ value: p.code, label: `${p.iso} ${p.code}` }))}
                                                width="110px"
                                            />
                                            <div className="relative flex-1">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="612 345 678" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* --- Acceso --- */}
                                <p className="text-xs font-black text-primary uppercase tracking-[0.2em] border-b border-variable pb-2 pt-2">Acceso</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email de Empresa</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="juan@automatizatelo.com" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Contraseña</label>
                                        <input required type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="••••••••" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Privilegios</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {['user', 'editor', 'admin'].map((role) => (
                                                <button key={role} type="button" onClick={() => setFormData({ ...formData, role })}
                                                    className={`py-2 sm:py-2.5 rounded-2xl font-bold text-[10px] uppercase transition-all border ${formData.role === role ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-variable text-variable-muted hover:border-primary/30'}`}>
                                                    {role}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Estado</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[{ value: 'active', label: 'Activo', color: 'emerald' }, { value: 'banned', label: 'Baneado', color: 'rose' }].map((s) => (
                                                <button key={s.value} type="button" onClick={() => setFormData({ ...formData, status: s.value })}
                                                    className={`py-2 sm:py-2.5 rounded-2xl font-bold text-[10px] uppercase transition-all border ${formData.status === s.value
                                                        ? s.value === 'active' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-rose-500/20 border-rose-500 text-rose-500'
                                                        : 'bg-white/5 border-variable text-variable-muted hover:border-primary/30'
                                                        }`}>
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* --- Ubicación --- */}
                                <p className="text-xs font-black text-primary uppercase tracking-[0.2em] border-b border-variable pb-2 pt-2">Ubicación</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">País</label>
                                        <CustomSelect
                                            value={formData.country}
                                            onChange={(val) => setFormData({ ...formData, country: val, province: '' })}
                                            icon={Globe}
                                            options={[
                                                { value: 'España', label: 'España' },
                                                { value: 'Portugal', label: 'Portugal' },
                                                { value: 'Francia', label: 'Francia' },
                                                { value: 'Italia', label: 'Italia' },
                                                { value: 'Alemania', label: 'Alemania' },
                                                { value: 'Reino Unido', label: 'Reino Unido' },
                                                { value: 'México', label: 'México' },
                                                { value: 'Argentina', label: 'Argentina' },
                                                { value: 'Colombia', label: 'Colombia' },
                                                { value: 'Chile', label: 'Chile' },
                                                { value: 'Otro', label: 'Otro' },
                                            ]}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Provincia</label>
                                        {formData.country === 'España' ? (
                                            <CustomSelect
                                                value={formData.province}
                                                onChange={(val) => setFormData({ ...formData, province: val })}
                                                placeholder="Seleccionar..."
                                                options={[
                                                    { value: '', label: 'Seleccionar...' },
                                                    ...spanishProvinces.map((p) => ({ value: p, label: p }))
                                                ]}
                                            />
                                        ) : (
                                            <input value={formData.province} onChange={(e) => setFormData({ ...formData, province: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm" placeholder="Provincia / Estado" />
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Ciudad</label>
                                        <input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm" placeholder="Madrid" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Dirección</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm" placeholder="Calle Mayor, 1" />
                                        </div>
                                    </div>
                                </div>

                                {/* --- Submit --- */}
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
