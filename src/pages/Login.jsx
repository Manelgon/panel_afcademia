import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, LogIn, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('checking'); // 'checking', 'connected', 'error'
    const navigate = useNavigate();

    useEffect(() => {
        const checkConnection = async () => {
            try {
                const apiUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_PUBLIC_SUPABASE_URL || ''
                const apiKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

                const res = await fetch(`${apiUrl}/auth/v1/health`, {
                    method: 'GET',
                    headers: {
                        'apikey': apiKey
                    }
                });
                if (res.ok) {
                    setConnectionStatus('connected');
                } else {
                    setConnectionStatus('connected');
                    console.log("Health check response:", res.status);
                }
            } catch (err) {
                console.error("Connection check failed:", err);
                setConnectionStatus('error');
            }
        };
        checkConnection();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Tiempo de espera agotado. Verifica tu conexión.')), 30000)
            );

            const loginLogic = async () => {
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (authError) throw authError;

                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', authData.user.id)
                    .single();

                if (profileError) {
                    console.error("Error al obtener perfil:", profileError);
                    // Si recibimos un error 500 es muy probable que sea por la política RLS recursiva
                    if (profileError.code === '500' || profileError.message?.includes('recursion')) {
                        throw new Error('Error de servidor (RLS Recursion). Las políticas de la base de datos están mal configuradas.');
                    }
                }

                if (profile && profile.role !== 'admin') {
                    await supabase.auth.signOut();
                    throw new Error('Acceso denegado. Se requieren privilegios de Administrador.');
                }

                return true;
            };

            await Promise.race([loginLogic(), timeoutPromise]);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Error desconocido al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 transition-all duration-300">
            {/* Background elements */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] size-[500px] rounded-full bg-primary/20 blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] size-[500px] rounded-full bg-primary/10 blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden"
            >
                <div className="flex flex-col items-center mb-10 text-center">
                    <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center p-3 shadow-xl border border-variable mb-6">
                        <img src={logo} alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold font-display text-variable-main mb-2">Acceso <span className="text-primary italic">Premium</span></h1>
                    <p className="text-variable-muted text-sm font-medium italic">AFCademIA Admin Panel</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {/* Connection Status Indicator */}
                    <div className={`p-2 rounded-lg text-center text-xs font-bold uppercase tracking-widest ${connectionStatus === 'checking' ? 'bg-yellow-500/10 text-yellow-500' :
                        connectionStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-500 hidden' :
                            'bg-rose-500/10 text-rose-500'
                        }`}>
                        {connectionStatus === 'checking' && 'Verificando conexión...'}
                        {connectionStatus === 'connected' && 'Conectado'}
                        {connectionStatus === 'error' && 'Error de conexión con el servidor'}
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email Corporativo</label>
                        <div className="relative group">
                            <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-variable-muted group-focus-within:text-primary transition-colors" size={18} />
                            <input
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-white/5 border border-variable rounded-2xl pl-14 pr-6 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all"
                                placeholder="tuemail@afcademia.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Contraseña</label>
                        <div className="relative group">
                            <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-variable-muted group-focus-within:text-primary transition-colors" size={18} />
                            <input
                                required
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-white/5 border border-variable rounded-2xl pl-14 pr-6 py-4 focus:outline-none focus:border-primary/50 text-variable-main transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3 text-rose-500 text-xs font-bold uppercase tracking-wider"
                        >
                            <ShieldAlert size={18} />
                            <span>{error}</span>
                        </motion.div>
                    )}

                    <button
                        disabled={loading}
                        type="submit"
                        className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 group overflow-hidden relative"
                    >
                        {loading ? (
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
