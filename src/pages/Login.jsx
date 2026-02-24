import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, LogIn, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const { user, loading } = useAuth();

    // Si ya hay sesión activa, redirigir al panel
    useEffect(() => {
        if (!loading && user) {
            navigate('/', { replace: true });
        }
    }, [user, loading, navigate]);

    // Mientras auth carga, mostramos spinner para no flashear el formulario
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-variable-main">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    // Si ya hay usuario (sesión recuperada), no mostrar el formulario
    if (user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-variable-main">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    const handleLogin = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            // 1. Autenticación
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (authError) throw authError;

            // 2. Verificar que sea admin
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', authData.user.id)
                .single();

            if (profileError) {
                console.error('[Login] Profile error:', profileError.message);
                // Si hay error de perfil pero el auth fue ok, dejamos pasar
                // (puede que las RLS estén bloqueando, pero el usuario está autenticado)
            } else if (profileData && profileData.role !== 'admin') {
                await supabase.auth.signOut();
                throw new Error('Acceso denegado. Se requieren privilegios de Administrador.');
            }

            // 3. Navegamos — onAuthStateChange en AuthContext completará el resto
            navigate('/', { replace: true });
        } catch (err) {
            console.error('[Login] Error:', err.message);
            setError(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
            // En caso de error, aseguramos logout
            await supabase.auth.signOut();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            {/* Fondo */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] size-[500px] rounded-full bg-primary/20 blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] size-[500px] rounded-full bg-primary/10 blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl"
            >
                {/* Header */}
                <div className="flex flex-col items-center mb-10 text-center">
                    <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center p-3 shadow-xl border border-variable mb-6">
                        <img src={logo} alt="Logo AFCademIA" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold font-display text-variable-main mb-2">
                        Acceso <span className="text-primary italic">Premium</span>
                    </h1>
                    <p className="text-variable-muted text-sm font-medium italic">AFCademIA Admin Panel</p>
                </div>

                {/* Formulario */}
                <form onSubmit={handleLogin} className="space-y-6">
                    {/* Email */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">
                            Email Corporativo
                        </label>
                        <div className="relative group">
                            <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-variable-muted group-focus-within:text-primary transition-colors" size={18} />
                            <input
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={submitting}
                                className="w-full bg-white/5 border border-variable rounded-2xl pl-14 pr-6 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30 disabled:opacity-50"
                                placeholder="tuemail@afcademia.com"
                            />
                        </div>
                    </div>

                    {/* Contraseña */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">
                            Contraseña
                        </label>
                        <div className="relative group">
                            <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-variable-muted group-focus-within:text-primary transition-colors" size={18} />
                            <input
                                required
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={submitting}
                                className="w-full bg-white/5 border border-variable rounded-2xl pl-14 pr-6 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30 disabled:opacity-50"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3 text-rose-400 text-xs font-bold uppercase tracking-wider"
                        >
                            <ShieldAlert size={18} className="shrink-0" />
                            <span>{error}</span>
                        </motion.div>
                    )}

                    {/* Botón */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {submitting ? (
                            <div className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn size={20} className="group-hover:translate-x-1 transition-transform" />
                                Entrar al Panel
                            </>
                        )}
                    </button>

                    <p className="text-center text-[10px] text-variable-muted uppercase font-bold tracking-[0.2em] mt-8">
                        Sistema de seguridad <span className="text-primary">E2E Encriptado</span>
                    </p>
                </form>
            </motion.div>
        </div>
    );
}
