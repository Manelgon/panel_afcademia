import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck,
    Mail,
    ArrowRight,
    Loader2,
    CheckCircle,
    AlertCircle,
    RefreshCcw,
    Building2,
    Save,
    ClipboardList
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── CONFIGURACIÓN DEL COOLDOWN ──────────────────────────────────────────
const COOLDOWN_MINUTES = 5;

export default function FundaePublicForm() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tokenData, setTokenData] = useState(null);
    const [fundaeRecord, setFundaeRecord] = useState(null);

    // Estados de navegación interna
    // 0: Solicitar Código, 1: Verificar Código, 2: Formulario, 3: Éxito
    const [step, setStep] = useState(0);

    // Estado para OTP e intentos
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const otpRefs = useRef([]);
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // Estado del Formulario
    const [formData, setFormData] = useState({
        empresa: '',
        cif: '',
        telefono: '',
        num_asistentes: '',
        email: ''
    });
    const [submitting, setSubmitting] = useState(false);

    // ── CARGA INICIAL ─────────────────────────────────────────────────────
    useEffect(() => {
        const loadTokenData = async () => {
            try {
                // 1. Buscar el token
                const { data: tData, error: tError } = await supabase
                    .from('fundae_form_tokens')
                    .select('*, fundae_seguimiento(*)')
                    .eq('token', token)
                    .single();

                if (tError || !tData) {
                    setError('Este enlace no es válido o ya no existe.');
                    return;
                }

                // 2. Validaciones básicas
                if (tData.used) {
                    setError('Este formulario ya ha sido completado y enviado.');
                    return;
                }

                if (new Date(tData.expires_at) < new Date()) {
                    setError('Este enlace ha expirado (validez de 48h). Solicita uno nuevo.');
                    return;
                }

                setTokenData(tData);
                setFundaeRecord(tData.fundae_seguimiento);
                setFormData({
                    empresa: tData.fundae_seguimiento.empresa || '',
                    cif: tData.fundae_seguimiento.cif || '',
                    telefono: tData.fundae_seguimiento.telefono || '',
                    num_asistentes: tData.fundae_seguimiento.num_asistentes || '',
                    email: tData.email || ''
                });

                // Determinar el paso inicial
                if (tData.verified) {
                    setStep(2); // Ya verificado -> Formulario
                } else if (tData.verification_code) {
                    setStep(1); // Ya tiene código -> Verificar
                    handleCooldown(tData.code_sent_at);
                } else {
                    setStep(0); // Solicitar código
                }

            } catch (err) {
                console.error(err);
                setError('Error al conectar con el servidor.');
            } finally {
                setLoading(false);
            }
        };

        loadTokenData();
    }, [token]);

    // ── MANEJO DEL CONTADOR (COOLDOWN) ────────────────────────────────────
    const handleCooldown = (sentAt) => {
        if (!sentAt) return;
        const now = new Date();
        const sent = new Date(sentAt);
        const diff = Math.floor((now - sent) / 1000); // segundos
        const wait = COOLDOWN_MINUTES * 60 - diff;
        if (wait > 0) setCooldown(wait);
    };

    useEffect(() => {
        if (cooldown > 0) {
            const timer = setInterval(() => setCooldown(c => c - 1), 1000);
            return () => clearInterval(timer);
        }
    }, [cooldown]);

    const formatCooldown = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ── ACCIONES ─────────────────────────────────────────────────────────

    // 1. Solicitar/Regenerar Código
    const handleRequestCode = async () => {
        if (cooldown > 0) return;
        setResending(true);
        try {
            const webhookUrl = import.meta.env.VITE_WEBHOOK_FORMULARIO_FUNDAE_URL;
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate_verification_code',
                    token: token,
                    fundae_id: tokenData.fundae_id,
                    email: tokenData.email,
                    empresa: fundaeRecord.empresa
                })
            });

            if (!res.ok) throw new Error('Error al generar código');

            // Actualizar estado local (simulamos actualización de cooldown)
            setCooldown(COOLDOWN_MINUTES * 60);
            setStep(1);
            setOtp(['', '', '', '', '', '']); // Limpiar OTP

        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setResending(false);
        }
    };

    // 2. Verificar Código
    const handleVerify = async () => {
        const code = otp.join('');
        if (code.length < 6) return;

        setVerifying(true);
        try {
            // Verificamos directamente contra Supabase
            const { data, error } = await supabase
                .from('fundae_form_tokens')
                .select('*')
                .eq('token', token)
                .single();

            if (data.attempts >= data.max_attempts) {
                setError('Demasiados intentos fallidos. Contacta con nosotros.');
                return;
            }

            if (data.verification_code === code) {
                // Éxito: Marcar como verificado
                await supabase
                    .from('fundae_form_tokens')
                    .update({ verified: true, verified_at: new Date() })
                    .eq('token', token);

                setStep(2);
            } else {
                // Error: Incrementar intentos
                await supabase
                    .from('fundae_form_tokens')
                    .update({ attempts: data.attempts + 1 })
                    .eq('token', token);

                alert('Código incorrecto. Te quedan ' + (data.max_attempts - data.attempts - 1) + ' intentos.');
                setOtp(['', '', '', '', '', '']);
                otpRefs.current[0].focus();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setVerifying(false);
        }
    };

    // 3. Enviar Formulario
    const handleSubmitForm = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // 1. Actualizar el expediente de FUNDAE
            const { error: fError } = await supabase
                .from('fundae_seguimiento')
                .update({
                    empresa: formData.empresa,
                    cif: formData.cif,
                    telefono: formData.telefono,
                    num_asistentes: parseInt(formData.num_asistentes) || 0,
                    email: formData.email,
                    formulario_recibido: true,
                    formulario_enviado: true // Aseguramos que el paso 1 esté a true
                })
                .eq('id', tokenData.fundae_id);

            if (fError) throw fError;

            // 2. Marcar el token como usado
            await supabase
                .from('fundae_form_tokens')
                .update({ used: true })
                .eq('token', token);

            setStep(3);
        } catch (err) {
            alert('Error al enviar: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ── RENDERIZADO OTP ───────────────────────────────────────────────────
    const handleOtpChange = (value, index) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);

        if (value && index < 5) {
            otpRefs.current[index + 1].focus();
        }
    };

    const handleOtpKeyDown = (e, index) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1].focus();
        }
        if (e.key === 'Enter' && otp.every(v => v !== '')) {
            handleVerify();
        }
    };

    // ── VISTAS ────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <Loader2 className="animate-spin text-primary size-12" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
            <div className="glass p-10 rounded-3xl max-w-md border-rose-500/20">
                <AlertCircle className="text-rose-500 size-16 mx-auto mb-6" />
                <h2 className="text-2xl font-bold text-white mb-4">Enlace no válido</h2>
                <p className="text-gray-400 mb-8">{error}</p>
                <a href="https://afcademia.com" className="text-primary font-bold hover:underline">Volver a la web principal</a>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden flex flex-col items-center justify-center p-4 relative">
            {/* Background Decorations */}
            <div className="absolute top-[-10%] left-[-10%] size-[40vw] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] size-[40vw] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-xl relative z-10">
                {/* Header / Logo */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <div className="size-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <ShieldCheck className="text-white size-6" />
                        </div>
                        <span className="text-2xl font-black italic tracking-tighter">AFCADEMIA</span>
                    </div>
                    <div className="h-1 w-12 bg-primary mx-auto rounded-full" />
                </div>

                <AnimatePresence mode="wait">
                    {/* Pantalla 0: Solicitar Código */}
                    {step === 0 && (
                        <motion.div
                            key="step0"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="glass p-8 sm:p-12 rounded-[2.5rem] border-white/5 shadow-2xl text-center"
                        >
                            <Mail className="text-primary size-16 mx-auto mb-6" />
                            <h1 className="text-3xl font-bold mb-4">Verificación de Identidad</h1>
                            <p className="text-gray-400 mb-8">
                                Para proteger tus datos, necesitamos verificar tu identidad. Pulsa el botón para recibir un código en tu email:
                                <br /><span className="text-white font-mono mt-2 block">{tokenData?.email}</span>
                            </p>
                            <button
                                onClick={handleRequestCode}
                                disabled={resending}
                                className="w-full bg-primary hover:brightness-110 disabled:opacity-50 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary/20 group"
                            >
                                {resending ? <Loader2 className="animate-spin" /> : <><RefreshCcw className="group-hover:rotate-180 transition-all duration-700" size={20} /> Solicitar código</>}
                            </button>
                        </motion.div>
                    )}

                    {/* Pantalla 1: Verificar Código */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="glass p-8 sm:p-12 rounded-[2.5rem] border-white/5 shadow-2xl text-center"
                        >
                            <h1 className="text-3xl font-bold mb-2">Introduce el código</h1>
                            <p className="text-gray-400 mb-8">
                                Hemos enviado un código de 6 dígitos a <br />
                                <strong className="text-white">{tokenData?.email}</strong>
                            </p>

                            <div className="flex justify-between gap-2 sm:gap-4 mb-8">
                                {otp.map((digit, i) => (
                                    <input
                                        key={i}
                                        ref={el => otpRefs.current[i] = el}
                                        type="text"
                                        maxLength={1}
                                        value={digit}
                                        onChange={e => handleOtpChange(e.target.value, i)}
                                        onKeyDown={e => handleOtpKeyDown(e, i)}
                                        className="size-12 sm:size-14 glass text-center text-xl font-bold rounded-xl border-white/10 focus:border-primary/50 focus:outline-none transition-all"
                                        autoFocus={i === 0}
                                    />
                                ))}
                            </div>

                            <button
                                onClick={handleVerify}
                                disabled={verifying || otp.some(v => v === '')}
                                className="w-full bg-primary hover:brightness-110 disabled:opacity-30 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary/20 mb-6"
                            >
                                {verifying ? <Loader2 className="animate-spin" /> : <>Verificar Código <ArrowRight size={20} /></>}
                            </button>

                            <div className="pt-6 border-t border-white/5">
                                <p className="text-xs text-gray-500 mb-4">¿No has recibido nada? Revisa el correo no deseado.</p>
                                <button
                                    onClick={handleRequestCode}
                                    disabled={resending || cooldown > 0}
                                    className="text-sm font-bold text-gray-400 hover:text-primary disabled:text-gray-700 transition-colors flex items-center gap-2 mx-auto"
                                >
                                    <RefreshCcw size={14} className={resending ? 'animate-spin' : ''} />
                                    {cooldown > 0 ? `Reenviar en ${formatCooldown(cooldown)}` : 'Solicitar un nuevo código'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Pantalla 2: Formulario FUNDAE */}
                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass p-8 sm:p-12 rounded-[2.5rem] border-white/5 shadow-2xl"
                        >
                            <div className="flex items-center gap-4 mb-8">
                                <div className="size-12 bg-primary/20 rounded-2xl flex items-center justify-center">
                                    <ClipboardList className="text-primary size-6" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold">Datos del Expediente</h1>
                                    <p className="text-xs text-variable-muted uppercase font-black tracking-widest">Formulario Oficial FUNDAE</p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmitForm} className="space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Nombre de la Empresa</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 size-5" />
                                            <input
                                                required
                                                value={formData.empresa}
                                                onChange={e => setFormData({ ...formData, empresa: e.target.value })}
                                                className="w-full pl-12 pr-6 py-4 glass border-white/5 rounded-2xl focus:border-primary/50 focus:outline-none transition-all"
                                                placeholder="Ej. Mi Empresa S.L."
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">CIF / NIF</label>
                                            <input
                                                required
                                                value={formData.cif}
                                                onChange={e => setFormData({ ...formData, cif: e.target.value })}
                                                className="w-full px-6 py-4 glass border-white/5 rounded-2xl focus:border-primary/50 focus:outline-none transition-all font-mono"
                                                placeholder="B12345678"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Nº Trabajadores / Alumnos</label>
                                            <input
                                                type="number"
                                                required
                                                value={formData.num_asistentes}
                                                onChange={e => setFormData({ ...formData, num_asistentes: e.target.value })}
                                                className="w-full px-6 py-4 glass border-white/5 rounded-2xl focus:border-primary/50 focus:outline-none transition-all"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Email de Contacto</label>
                                            <input
                                                type="email"
                                                required
                                                value={formData.email}
                                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full px-6 py-4 glass border-white/5 rounded-2xl focus:border-primary/50 focus:outline-none transition-all"
                                                placeholder="empresa@mail.com"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Teléfono</label>
                                            <input
                                                required
                                                value={formData.telefono}
                                                onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                                className="w-full px-6 py-4 glass border-white/5 rounded-2xl focus:border-primary/50 focus:outline-none transition-all"
                                                placeholder="+34"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl flex items-start gap-4">
                                    <AlertCircle className="text-primary size-5 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-gray-400">
                                        Al enviar este formulario confirmas que los datos proporcionados son correctos para la gestión de la formación bonificada ante FUNDAE.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-primary hover:brightness-110 disabled:opacity-50 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary/20"
                                >
                                    {submitting ? <Loader2 className="animate-spin" /> : <><Save size={20} /> Enviar Formulario</>}
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {/* Pantalla 3: Éxito */}
                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass p-8 sm:p-12 rounded-[2.5rem] border-white/5 shadow-2xl text-center"
                        >
                            <div className="size-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                                <CheckCircle className="text-emerald-500 size-12" />
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1.5, opacity: 0 }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="absolute inset-0 bg-emerald-500/20 rounded-full"
                                />
                            </div>
                            <h1 className="text-3xl font-bold mb-4">¡Enviado con éxito!</h1>
                            <p className="text-gray-400 mb-8 leading-relaxed">
                                Hemos recibido correctamente los datos para el expediente FUNDAE. <br />
                                Nuestro equipo los revisará y te informaremos sobre los siguientes pasos.
                            </p>
                            <div className="pt-8 border-t border-white/5">
                                <p className="text-xs text-gray-600 italic">Ya puedes cerrar esta ventana con seguridad.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer Info */}
                <div className="mt-12 text-center">
                    <p className="text-[10px] text-gray-600 uppercase font-black tracking-[0.3em]">Gestión Profesional · AFCADEMIA</p>
                </div>
            </div>
        </div>
    );
}
