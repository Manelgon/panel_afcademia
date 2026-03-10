import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail,
    ArrowRight,
    Loader2,
    CheckCircle,
    AlertCircle,
    RefreshCcw,
    Building2,
    Save,
    ClipboardList,
    ShieldAlert
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import logo_fundae from '../assets/logo_fundae.png';
import CustomSelect from '../components/CustomSelect';

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
        razon_social: '',
        cif: '',
        telefono: '',
        email: '',
        domicilio: '',
        poblacion: '',
        codigo_postal: '',
        provincia: '',
        convenio_referencia: '',
        cnae: '',
        ccc: '',
        num_medio_empleados: '',
        num_asistentes: '',
        representante_empresa: '',
        nif_nie_representante: ''
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
                const fundae = tData.fundae_seguimiento || {};
                setFundaeRecord(fundae);
                setFormData({
                    empresa: fundae.empresa || '',
                    razon_social: fundae.razon_social || '',
                    cif: fundae.cif || '',
                    telefono: fundae.telefono || '',
                    email: tData.email || '',
                    domicilio: fundae.domicilio || '',
                    tipo_via: fundae.tipo_via || '',
                    nombre_via: fundae.nombre_via || '',
                    numero_via: fundae.numero_via || '',
                    piso: fundae.piso || '',
                    puerta: fundae.puerta || '',
                    poblacion: fundae.poblacion || '',
                    codigo_postal: fundae.codigo_postal || '',
                    provincia: fundae.provincia || '',
                    convenio_referencia: fundae.convenio_referencia || '',
                    cnae: fundae.cnae || '',
                    ccc: fundae.ccc || '',
                    num_medio_empleados: fundae.num_medio_empleados || '',
                    num_asistentes: fundae.num_asistentes || '',
                    prefijo_telefono: fundae.prefijo_telefono || '+34',
                    representante_empresa: fundae.representante_empresa || '',
                    representante_nombre: fundae.representante_nombre || '',
                    representante_apellido1: fundae.representante_apellido1 || '',
                    representante_apellido2: fundae.representante_apellido2 || '',
                    nif_nie_representante: fundae.nif_nie_representante || ''
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
            const webhookUrl = import.meta.env.VITE_CODIGO_FUNDAE;
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: token,
                    fundae_id: tokenData.fundae_id,
                    email: tokenData.email,
                    empresa: fundaeRecord?.empresa
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
                    razon_social: formData.razon_social,
                    cif: formData.cif,
                    telefono: formData.telefono,
                    email: formData.email,
                    domicilio: formData.domicilio,
                    poblacion: formData.poblacion,
                    codigo_postal: formData.codigo_postal,
                    provincia: formData.provincia,
                    convenio_referencia: formData.convenio_referencia,
                    cnae: formData.cnae,
                    ccc: formData.ccc,
                    num_medio_empleados: formData.num_medio_empleados,
                    num_asistentes: parseInt(formData.num_asistentes) || 0,
                    representante_empresa: formData.representante_empresa,
                    nif_nie_representante: formData.nif_nie_representante,
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
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-main)' }}>
            <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-main)' }}>
            {/* Fondo */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] size-[500px] rounded-full bg-primary/20 blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] size-[500px] rounded-full bg-primary/10 blur-[120px]" />
            </div>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl text-center"
            >
                <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center p-3 shadow-xl border border-variable mb-6 mx-auto">
                    <img src={logo} alt="Logo AFCademIA" className="w-full h-full object-contain" />
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5 mb-6">
                    <AlertCircle className="text-rose-400 size-12 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-variable-main mb-2">Enlace no válido</h2>
                    <p className="text-variable-muted text-sm">{error}</p>
                </div>
                <a href="https://afcademia.com" className="text-primary font-bold hover:underline text-sm">
                    Volver a la web principal
                </a>
            </motion.div>
        </div>
    );

    return (
        <div className="min-h-screen overflow-x-hidden flex flex-col items-center justify-center p-4 sm:p-6 relative" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' }}>
            {/* Background Decorations */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] size-[500px] rounded-full bg-primary/20 blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] size-[500px] rounded-full bg-primary/10 blur-[120px]" />
            </div>

            <div className="w-full max-w-7xl relative z-10 transition-all duration-500">
                <AnimatePresence mode="wait">
                    {/* Pantalla 0: Solicitar Código */}
                    {step === 0 && (
                        <motion.div
                            key="step0"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl text-center max-w-xl mx-auto"
                        >
                            <div className="size-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <Mail className="text-primary size-8" />
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-variable-main mb-3">Verificación de Identidad</h2>
                            <p className="text-variable-muted text-sm mb-8 leading-relaxed">
                                Para proteger tus datos, necesitamos verificar tu identidad. Pulsa el botón para recibir un código en tu email:
                                <br /><span className="text-primary font-semibold mt-2 block">{tokenData?.email}</span>
                            </p>
                            <button
                                onClick={handleRequestCode}
                                disabled={resending}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed"
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
                            className="glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl text-center max-w-xl mx-auto"
                        >
                            <h2 className="text-2xl sm:text-3xl font-bold text-variable-main mb-2">Introduce el código</h2>
                            <p className="text-variable-muted text-sm mb-8">
                                Hemos enviado un código de 6 dígitos a <br />
                                <strong className="text-primary">{tokenData?.email}</strong>
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
                                        className="size-12 sm:size-14 bg-white/5 border border-variable text-center text-xl font-bold rounded-2xl focus:border-primary/50 focus:outline-none transition-all text-variable-main"
                                        autoFocus={i === 0}
                                    />
                                ))}
                            </div>

                            <button
                                onClick={handleVerify}
                                disabled={verifying || otp.some(v => v === '')}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed mb-6"
                            >
                                {verifying ? <Loader2 className="animate-spin" /> : <>Verificar Código <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
                            </button>

                            <div className="pt-6 border-t border-variable">
                                <p className="text-xs text-variable-muted mb-4">¿No has recibido nada? Revisa el correo no deseado.</p>
                                <button
                                    onClick={handleRequestCode}
                                    disabled={resending || cooldown > 0}
                                    className="text-sm font-bold text-variable-muted hover:text-primary disabled:opacity-40 transition-colors flex items-center gap-2 mx-auto"
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
                            className="glass rounded-[2rem] p-6 lg:p-10 shadow-2xl w-full mx-auto"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-variable">
                                <div className="flex items-center gap-4">
                                    <div className="size-14 bg-white/50 rounded-2xl flex items-center justify-center shadow-sm p-2 shrink-0 border border-variable/10 overflow-hidden">
                                        <img src={logo_fundae} alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2 select-none">
                                            <span className="text-xl sm:text-2xl font-bold text-[#004b90] tracking-tight">Formulario</span>
                                            <span className="text-2xl sm:text-3xl font-black italic text-[#ff7900] leading-none">FUNDAE</span>
                                        </div>
                                        <div className="h-1 w-24 bg-gradient-to-r from-[#004b90] to-[#ff7900] rounded-full mt-1 opacity-20"></div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <h2 className="text-xl sm:text-2xl font-bold text-variable-main">Datos del Expediente</h2>
                                    <p className="hidden sm:block text-[10px] text-variable-muted uppercase font-black tracking-wider mt-0.5 opacity-50">Gestión de Formación</p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmitForm} className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-12">
                                {/* COLUMNA IZQUIERDA */}
                                <div className="space-y-6">
                                    {/* SECCIÓN 1: Identificación de la Empresa */}
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                                            <Building2 size={16} /> Identificación de la Empresa
                                        </h3>
                                        <div className="bg-white/5 border border-variable rounded-2xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-1.5 sm:col-span-2">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Razón Social</label>
                                                <input
                                                    required
                                                    value={formData.razon_social}
                                                    onChange={e => setFormData({ ...formData, razon_social: e.target.value })}
                                                    className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Ej. Mi Empresa S.L."
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre Comercial</label>
                                                <input
                                                    required
                                                    value={formData.empresa}
                                                    onChange={e => setFormData({ ...formData, empresa: e.target.value })}
                                                    className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Ej. Mi Empresa"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">CIF / NIF</label>
                                                <input
                                                    required
                                                    value={formData.cif}
                                                    onChange={e => setFormData({ ...formData, cif: e.target.value })}
                                                    className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30 font-mono"
                                                    placeholder="B12345678"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECCIÓN 2: Domicilio y Contacto */}
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                                            <Mail size={16} /> Domicilio y Contacto
                                        </h3>
                                        <div className="bg-white/5 border border-variable rounded-2xl p-4 sm:p-5 space-y-6">
                                            {/* Teléfono */}
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Teléfono</label>
                                                <div className="flex gap-2">
                                                    <CustomSelect
                                                        value={formData.prefijo_telefono}
                                                        onChange={val => setFormData({ ...formData, prefijo_telefono: val })}
                                                        options={[
                                                            { value: '+34', label: '+34 (ES)' },
                                                            { value: '+33', label: '+33 (FR)' },
                                                            { value: '+351', label: '+351 (PT)' },
                                                            { value: '+44', label: '+44 (UK)' },
                                                            { value: '+1', label: '+1 (US)' }
                                                        ]}
                                                        width="120px"
                                                    />
                                                    <input
                                                        required
                                                        value={formData.telefono}
                                                        onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                                        className="flex-1 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                        placeholder="600 000 000"
                                                    />
                                                </div>
                                            </div>

                                            {/* Email Solo debajo */}
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Email de Contacto</label>
                                                <input
                                                    type="email"
                                                    required
                                                    value={formData.email}
                                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                    className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="empresa@mail.com"
                                                />
                                            </div>

                                            {/* Domicilio - Línea 1: Tipo + Nombre */}
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Domicilio Social</label>
                                                <div className="grid grid-cols-12 gap-2">
                                                    <div className="col-span-12 sm:col-span-4 lg:col-span-3">
                                                        <CustomSelect
                                                            value={formData.tipo_via}
                                                            onChange={val => setFormData({ ...formData, tipo_via: val })}
                                                            options={[
                                                                { value: 'Calle', label: 'Calle' },
                                                                { value: 'Avenida', label: 'Avenida' },
                                                                { value: 'Plaza', label: 'Plaza' },
                                                                { value: 'Paseo', label: 'Paseo' },
                                                                { value: 'Poligono', label: 'Polígono' }
                                                            ]}
                                                            placeholder="Tipo"
                                                        />
                                                    </div>
                                                    <input
                                                        required
                                                        value={formData.nombre_via}
                                                        onChange={e => setFormData({ ...formData, nombre_via: e.target.value })}
                                                        className="col-span-12 sm:col-span-8 lg:col-span-9 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                        placeholder="Nombre de la vía"
                                                    />
                                                </div>
                                            </div>

                                            {/* Domicilio - Línea 2: Número, Piso, Puerta, Localidad */}
                                            <div className="grid grid-cols-12 gap-2">
                                                <input
                                                    required
                                                    value={formData.numero_via}
                                                    onChange={e => setFormData({ ...formData, numero_via: e.target.value })}
                                                    className="col-span-3 sm:col-span-2 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Nº"
                                                />
                                                <input
                                                    value={formData.piso}
                                                    onChange={e => setFormData({ ...formData, piso: e.target.value })}
                                                    className="col-span-3 sm:col-span-2 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Piso"
                                                />
                                                <input
                                                    value={formData.puerta}
                                                    onChange={e => setFormData({ ...formData, puerta: e.target.value })}
                                                    className="col-span-3 sm:col-span-2 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Pta"
                                                />
                                                <input
                                                    required
                                                    value={formData.poblacion}
                                                    onChange={e => setFormData({ ...formData, poblacion: e.target.value })}
                                                    className="col-span-12 sm:col-span-6 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Localidad"
                                                />
                                            </div>

                                            {/* Domicilio - Línea 3: CP y Provincia Dropdown */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">C.P.</label>
                                                    <input
                                                        required
                                                        value={formData.codigo_postal}
                                                        onChange={e => setFormData({ ...formData, codigo_postal: e.target.value })}
                                                        className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                        placeholder="28001"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Provincia</label>
                                                    <CustomSelect
                                                        value={formData.provincia}
                                                        onChange={val => setFormData({ ...formData, provincia: val })}
                                                        options={["Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ciudad Real", "Córdoba", "Cuenca", "Gerona", "Granada", "Guadalajara", "Guipúzcoa", "Huelva", "Huesca", "Jaén", "La Coruña", "La Rioja", "Las Palmas", "León", "Lérida", "Lugo", "Madrid", "Málaga", "Murcia", "Navarra", "Orense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza", "Ceuta", "Melilla"].map(p => ({ value: p, label: p }))}
                                                        placeholder="Selecciona provincia"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* COLUMNA DERECHA */}
                                <div className="space-y-6 flex flex-col">
                                    {/* SECCIÓN 3: Datos Laborales y Representación */}
                                    <div className="space-y-3 flex-grow">
                                        <h3 className="text-sm font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                                            <ClipboardList size={16} /> Laboral y Representación
                                        </h3>
                                        <div className="bg-white/5 border border-variable rounded-2xl p-4 sm:p-5 space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">CNAE (Actividad)</label>
                                                    <input
                                                        required
                                                        value={formData.cnae}
                                                        onChange={e => setFormData({ ...formData, cnae: e.target.value })}
                                                        className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30 font-mono"
                                                        placeholder="0000"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Plantilla Media (2025)</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        value={formData.num_medio_empleados}
                                                        onChange={e => setFormData({ ...formData, num_medio_empleados: e.target.value })}
                                                        className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                        placeholder="Ej. 15"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Convenio de Referencia</label>
                                                <input
                                                    required
                                                    value={formData.convenio_referencia}
                                                    onChange={e => setFormData({ ...formData, convenio_referencia: e.target.value })}
                                                    className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Ej. Convenio Oficinas y Despachos"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Cód. Cuenta Cotización (CCC)</label>
                                                <input
                                                    required
                                                    value={formData.ccc}
                                                    onChange={e => setFormData({ ...formData, ccc: e.target.value })}
                                                    className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30 font-mono"
                                                    placeholder="00000000000"
                                                />
                                            </div>

                                            <div className="pt-4 border-t border-variable/50 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5 sm:col-span-2">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre (Representante Legal)</label>
                                                    <input
                                                        required
                                                        value={formData.representante_nombre}
                                                        onChange={e => setFormData({ ...formData, representante_nombre: e.target.value })}
                                                        className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                        placeholder="Nombre(s)"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Primer Apellido</label>
                                                    <input
                                                        required
                                                        value={formData.representante_apellido1}
                                                        onChange={e => setFormData({ ...formData, representante_apellido1: e.target.value })}
                                                        className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                        placeholder="Primer Apellido"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Segundo Apellido</label>
                                                    <input
                                                        value={formData.representante_apellido2}
                                                        onChange={e => setFormData({ ...formData, representante_apellido2: e.target.value })}
                                                        className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                        placeholder="Segundo Apellido"
                                                    />
                                                </div>
                                                <div className="space-y-1.5 sm:col-span-2">
                                                    <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">NIF/NIE Rep.</label>
                                                    <input
                                                        required
                                                        value={formData.nif_nie_representante}
                                                        onChange={e => setFormData({ ...formData, nif_nie_representante: e.target.value })}
                                                        className="w-full bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30 font-mono"
                                                        placeholder="12345678Z"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 pt-4 border-t border-variable/50">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Trabajadores a Formar (Estimado)</label>
                                                <input
                                                    type="number"
                                                    required
                                                    value={formData.num_asistentes}
                                                    onChange={e => setFormData({ ...formData, num_asistentes: e.target.value })}
                                                    className="w-full sm:w-1/2 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
                                                    placeholder="Ej. 5"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                {/* Submit Botón y Alerta — Ahora fuera del grid para ocupar todo el ancho */}
                                <div className="xl:col-span-2 space-y-4 pt-6 border-t border-variable/20">
                                    <div className="bg-primary/5 border border-primary/10 p-5 rounded-3xl flex items-center gap-4 shadow-inner">
                                        <div className="size-10 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                                            <AlertCircle className="text-primary size-5" />
                                        </div>
                                        <p className="text-[13px] text-variable-muted leading-relaxed font-medium">
                                            Al enviar este formulario confirmas que los datos proporcionados son veraces y correctos para la gestión de la formación bonificada.
                                        </p>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full py-5 bg-primary text-white rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] hover:brightness-110 active:scale-[0.98] transition-all shadow-2xl shadow-primary/40 flex items-center justify-center gap-3 group disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {submitting ? <Loader2 className="animate-spin" /> : <><Save size={24} className="group-hover:scale-110 transition-transform" /> Guardar Expediente Final</>}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    )}

                    {/* Pantalla 3: Éxito */}
                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl text-center"
                        >
                            <div className="size-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                                <CheckCircle className="text-emerald-500 size-12" />
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1.5, opacity: 0 }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="absolute inset-0 bg-emerald-500/10 rounded-full"
                                />
                            </div>
                            <h2 className="text-3xl font-bold text-variable-main mb-4">¡Enviado con éxito!</h2>
                            <p className="text-variable-muted mb-8 leading-relaxed text-sm">
                                Hemos recibido correctamente los datos para el expediente FUNDAE. <br />
                                Nuestro equipo los revisará y te informaremos sobre los siguientes pasos.
                            </p>
                            <div className="pt-8 border-t border-variable">
                                <p className="text-xs text-variable-muted italic">Ya puedes cerrar esta ventana con seguridad.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer Info */}
                <div className="mt-12 text-center">
                    <p className="text-[10px] text-variable-muted uppercase font-bold tracking-[0.2em]">
                        Sistema seguro · <span className="text-primary">AFCademIA</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
