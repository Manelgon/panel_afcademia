import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail,
    ArrowRight,
    ArrowLeft,
    Loader2,
    CheckCircle,
    AlertCircle,
    RefreshCcw,
    Users,
    Save,
    Download,
    GraduationCap
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CustomSelect from '../components/CustomSelect';
import { NIVELES_ESTUDIOS, CATEGORIAS_PROFESIONALES, labelToValue, valueToLabel } from '../components/fundae/fundaeConstants';
import logo from '../assets/logo.png';
import logo_fundae from '../assets/logo_fundae.png';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COOLDOWN_MINUTES = 5;

const emptyAlumno = () => ({
    nombre: '',
    apellido1: '',
    apellido2: '',
    dni: '',
    email: '',
    telefono: '',
    fecha_nacimiento: '',
    nivel_estudios: '',
    categoria_profesional: '',
    discapacidad_33: false,
    nass: '',
    coste_salarial_hora: '',
    solapa_horario: false,
    horas_solapadas: ''
});

// Une los dos apellidos para guardar en BD (campo `apellidos` único)
const joinApellidos = (a1, a2) => [a1, a2].map(s => (s || '').trim()).filter(Boolean).join(' ');

export default function FundaeAlumnosPublic() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tokenData, setTokenData] = useState(null);
    const [fundaeRecord, setFundaeRecord] = useState(null);

    // 0: Solicitar Código · 1: Verificar · 2: Wizard alumnos · 3: Éxito
    const [step, setStep] = useState(0);

    // OTP
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const otpRefs = useRef([]);
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // Wizard
    const [numAsistentes, setNumAsistentes] = useState(0);
    const [alumnos, setAlumnos] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // ── CARGA INICIAL ─────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const rawToken = (token || '').trim();
                if (!rawToken) {
                    setError('Este enlace no es válido o ya no existe.');
                    return;
                }

                const { data: tData, error: tError } = await supabase
                    .from('fundae_alumnos_tokens')
                    .select('*, fundae_seguimiento(*)')
                    .eq('token', rawToken)
                    .maybeSingle();

                if (tError || !tData) {
                    setError('Este enlace no es válido o ya no existe.');
                    return;
                }

                if (tData.used) {
                    setError('Ya has completado las fichas de inscripción.');
                    return;
                }

                if (new Date(tData.expires_at) < new Date()) {
                    setError('Este enlace ha expirado. Contacta con AFCademIA para recibir uno nuevo.');
                    return;
                }

                setTokenData(tData);
                const fundae = tData.fundae_seguimiento || {};
                setFundaeRecord(fundae);

                const n = parseInt(fundae.num_asistentes || 0, 10) || 0;
                setNumAsistentes(n);

                // Cargar fichas existentes (drafts) si las hay
                const { data: existing } = await supabase
                    .from('fundae_alumnos')
                    .select('*')
                    .eq('fundae_id', fundae.id)
                    .order('created_at', { ascending: true });

                const drafts = (existing || []).map(row => {
                    // Separar apellidos guardados como string único: primera palabra = apellido1, resto = apellido2
                    const apsRaw = (row.apellidos || '').trim();
                    const apsParts = apsRaw.split(/\s+/);
                    const apellido1 = apsParts.shift() || '';
                    const apellido2 = apsParts.join(' ');
                    return ({
                    id: row.id,
                    nombre: row.nombre || '',
                    apellido1,
                    apellido2,
                    dni: row.dni || '',
                    email: row.email || '',
                    telefono: row.telefono || '',
                    fecha_nacimiento: row.fecha_nacimiento || '',
                    nivel_estudios: labelToValue(NIVELES_ESTUDIOS, row.nivel_estudios),
                    categoria_profesional: labelToValue(CATEGORIAS_PROFESIONALES, row.categoria_profesional),
                    discapacidad_33: !!row.discapacidad_33,
                    nass: row.nass || '',
                    coste_salarial_hora: row.coste_salarial_hora ?? '',
                    solapa_horario: !!row.solapa_horario,
                    horas_solapadas: row.horas_solapadas ?? '',
                    ficha_estado: row.ficha_estado
                    });
                });

                while (drafts.length < n) drafts.push(emptyAlumno());
                setAlumnos(drafts);

                if (tData.verified) setStep(2);
                else if (tData.verification_code) {
                    setStep(1);
                    handleCooldown(tData.code_sent_at);
                } else {
                    setStep(0);
                }
            } catch (err) {
                console.error(err);
                setError('Error al conectar con el servidor.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    const handleCooldown = (sentAt) => {
        if (!sentAt) return;
        const diff = Math.floor((Date.now() - new Date(sentAt).getTime()) / 1000);
        const wait = COOLDOWN_MINUTES * 60 - diff;
        if (wait > 0) setCooldown(wait);
    };

    useEffect(() => {
        if (cooldown > 0) {
            const t = setInterval(() => setCooldown(c => c - 1), 1000);
            return () => clearInterval(t);
        }
    }, [cooldown]);

    const formatCooldown = (s) => {
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r.toString().padStart(2, '0')}`;
    };

    // ── ACCIONES OTP ──────────────────────────────────────────────────────
    const handleRequestCode = async () => {
        if (cooldown > 0) return;
        setResending(true);
        try {
            const rawToken = (token || '').trim();
            const { data, error: rpcError } = await supabase.rpc('solicitar_fundae_alumnos_codigo_publico', {
                p_token: rawToken
            });
            if (rpcError) throw rpcError;
            if (!data?.success) {
                if (data?.error === 'cooldown' && typeof data.seconds_left === 'number') {
                    setCooldown(Math.max(0, data.seconds_left));
                    alert(`Debes esperar antes de pedir otro código (aprox. ${formatCooldown(data.seconds_left)}).`);
                    return;
                }
                const messages = {
                    missing_token: 'Enlace no válido.',
                    invalid_token: 'Enlace no válido.',
                    already_used: 'Las fichas ya fueron enviadas.',
                    expired: 'Este enlace ha caducado. Contacta con AFCademIA.'
                };
                alert(messages[data?.error] || 'No se pudo generar el código.');
                return;
            }
            setCooldown(COOLDOWN_MINUTES * 60);
            setStep(1);
            setOtp(['', '', '', '', '', '']);
        } catch (err) {
            alert('Error: ' + (err.message || 'No se pudo generar el código'));
        } finally {
            setResending(false);
        }
    };

    const handleVerify = async () => {
        const code = otp.join('');
        if (code.length < 6) return;
        setVerifying(true);
        try {
            const { data, error: rpcError } = await supabase.rpc('verify_fundae_alumnos_code', {
                p_token: (token || '').trim(),
                p_code: code
            });
            if (rpcError) throw rpcError;
            if (data?.success) {
                setStep(2);
                return;
            }
            const messages = {
                wrong_code: `Código incorrecto. Te quedan ${data?.attempts_left ?? 0} intentos.`,
                max_attempts: 'Demasiados intentos fallidos. Contacta con AFCademIA.',
                expired: 'El enlace ha expirado.',
                already_used: 'Las fichas ya fueron enviadas.',
                no_code_requested: 'Solicita primero el código.',
                invalid_token: 'Enlace no válido.'
            };
            alert(messages[data?.error] || 'No se pudo verificar el código.');
            setOtp(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
        } catch (err) {
            console.error(err);
            alert('Error verificando el código.');
        } finally {
            setVerifying(false);
        }
    };

    const handleOtpChange = (value, idx) => {
        if (!/^\d*$/.test(value)) return;
        const next = [...otp];
        next[idx] = value.slice(-1);
        setOtp(next);
        if (value && idx < 5) otpRefs.current[idx + 1]?.focus();
    };

    const handleOtpKeyDown = (e, idx) => {
        if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
        if (e.key === 'Enter' && otp.every(v => v !== '')) handleVerify();
    };

    // ── WIZARD ────────────────────────────────────────────────────────────
    const updateAlumno = (idx, patch) => {
        setAlumnos(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    };

    const validateAlumno = (a) => {
        const required = ['nombre', 'apellido1', 'dni', 'email', 'fecha_nacimiento', 'nivel_estudios', 'categoria_profesional', 'nass'];
        for (const f of required) {
            if (!a[f] || String(a[f]).trim() === '') return `Falta el campo: ${f.replace('_', ' ')}`;
        }
        if (a.solapa_horario && (!a.horas_solapadas || Number(a.horas_solapadas) <= 0)) {
            return 'Indica las horas que se solapan con el horario habitual.';
        }
        return null;
    };

    const handleNext = () => {
        const err = validateAlumno(alumnos[currentIdx]);
        if (err) { alert(err); return; }
        if (currentIdx < numAsistentes - 1) setCurrentIdx(currentIdx + 1);
    };

    const handlePrev = () => { if (currentIdx > 0) setCurrentIdx(currentIdx - 1); };

    // ── PDF ───────────────────────────────────────────────────────────────
    const imageToBase64 = async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result);
            r.readAsDataURL(blob);
        });
    };

    const generateFichaPDF = async (a) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const margin = 15;

        let logoAfc = null, logoFun = null;
        try { logoAfc = await imageToBase64(logo); } catch (_) { }
        try { logoFun = await imageToBase64(logo_fundae); } catch (_) { }

        // Header
        if (logoAfc) doc.addImage(logoAfc, 'PNG', margin, 8, 16, 16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0, 75, 144);
        doc.text('Formulario', margin + 20, 16);
        doc.setFont('helvetica', 'bolditalic');
        doc.setFontSize(15);
        doc.setTextColor(255, 121, 0);
        const fw = doc.getTextWidth('Formulario');
        doc.text('FUNDAE', margin + 20 + fw + 2, 17);
        if (logoFun) doc.addImage(logoFun, 'PNG', pageW - margin - 38, 8, 38, 16);
        doc.setDrawColor(230, 90, 30);
        doc.setLineWidth(0.5);
        doc.line(margin, 26, pageW - margin, 26);

        // Título
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(230, 90, 30);
        doc.text('FICHA DE INSCRIPCIÓN DE ALUMNO', pageW / 2, 36, { align: 'center' });
        doc.setTextColor(40, 40, 40);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const empresaTxt = fundaeRecord?.empresa || fundaeRecord?.razon_social || '';
        doc.text(`Empresa: ${empresaTxt}`, margin, 44);

        const rows = [
            ['Nombre y apellidos', `${a.nombre} ${a.apellidos}`.trim()],
            ['DNI', a.dni],
            ['Correo electrónico', a.email],
            ['Teléfono', a.telefono || '-'],
            ['Fecha de nacimiento', a.fecha_nacimiento],
            ['Nivel de estudios', valueToLabel(NIVELES_ESTUDIOS, a.nivel_estudios)],
            ['Categoría profesional', valueToLabel(CATEGORIAS_PROFESIONALES, a.categoria_profesional)],
            ['Discapacidad ≥ 33%', a.discapacidad_33 ? 'Sí' : 'No'],
            ['Nº afiliación SS (NASS)', a.nass],
            ['Coste salarial bruto/hora', a.coste_salarial_hora ? `${a.coste_salarial_hora} €` : '-'],
            ['Solapa con horario habitual', a.solapa_horario ? `Sí · ${a.horas_solapadas || 0} h` : 'No']
        ];

        autoTable(doc, {
            startY: 50,
            head: [['Campo', 'Valor']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [0, 56, 101], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 3 },
            columnStyles: { 0: { cellWidth: 65, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
            margin: { left: margin, right: margin }
        });

        const finalY = doc.lastAutoTable?.finalY || 200;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(110, 110, 110);
        doc.text(
            'El alumno declara que los datos aportados son veraces y autoriza su tratamiento para la gestión de la formación bonificada por FUNDAE.',
            margin, finalY + 10, { maxWidth: pageW - margin * 2 }
        );

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.text('Firma del trabajador:', margin, finalY + 30);
        doc.line(margin, finalY + 50, margin + 80, finalY + 50);
        const fechaStr = new Date().toLocaleDateString('es-ES');
        doc.text(`Fecha: ${fechaStr}`, pageW - margin - 50, finalY + 50);

        return doc.output('blob');
    };

    // ── ENVÍO FINAL ───────────────────────────────────────────────────────
    const handleSubmitAll = async () => {
        for (let i = 0; i < alumnos.length; i++) {
            const err = validateAlumno(alumnos[i]);
            if (err) {
                setCurrentIdx(i);
                alert(`Alumno ${i + 1}: ${err}`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const fundaeId = tokenData.fundae_id;
            const rawToken = (token || '').trim();

            for (let i = 0; i < alumnos.length; i++) {
                const a = alumnos[i];

                // Normalización para que el admin reciba datos limpios.
                const dniNorm = String(a.dni || '').trim().toUpperCase().replace(/\s+/g, '');
                const emailNorm = a.email ? String(a.email).trim().toLowerCase() : null;
                const apellidosJoined = joinApellidos(a.apellido1, a.apellido2);

                // El form público NO toca la tabla `alumnos`. Solo crea/actualiza la ficha.
                // El admin verificará y convertirá después desde el panel.

                // PDF firmado por el cliente.
                const blob = await generateFichaPDF({ ...a, dni: dniNorm, email: emailNorm, apellidos: apellidosJoined });

                const fichaPayload = {
                    fundae_id: fundaeId,
                    alumno_id: null,
                    empresa: fundaeRecord?.empresa || fundaeRecord?.razon_social || null,
                    nombre: a.nombre,
                    apellidos: apellidosJoined,
                    dni: dniNorm,
                    email: emailNorm,
                    telefono: a.telefono || null,
                    fecha_nacimiento: a.fecha_nacimiento || null,
                    nivel_estudios: valueToLabel(NIVELES_ESTUDIOS, a.nivel_estudios) || null,
                    categoria_profesional: valueToLabel(CATEGORIAS_PROFESIONALES, a.categoria_profesional) || null,
                    discapacidad_33: !!a.discapacidad_33,
                    nass: a.nass || null,
                    coste_salarial_hora: a.coste_salarial_hora === '' ? null : Number(a.coste_salarial_hora),
                    solapa_horario: !!a.solapa_horario,
                    horas_solapadas: a.solapa_horario ? Number(a.horas_solapadas || 0) : null,
                    ficha_estado: 'firmada',
                    firmada_at: new Date().toISOString()
                };

                // Insertar/actualizar ficha primero para tener el id antes de subir el PDF.
                let fichaId = a.id || null;
                if (fichaId) {
                    const { error } = await supabase.from('fundae_alumnos').update(fichaPayload).eq('id', fichaId);
                    if (error) throw error;
                } else {
                    const { data: ins, error } = await supabase
                        .from('fundae_alumnos')
                        .insert(fichaPayload)
                        .select('id')
                        .single();
                    if (error) throw error;
                    fichaId = ins.id;
                }

                // Subir PDF firmado al bucket usando el id de la ficha.
                const pdfPath = `${fundaeId}/fichas/${fichaId}.pdf`;
                const { error: upErr } = await supabase.storage
                    .from('fundae-docs')
                    .upload(pdfPath, blob, { contentType: 'application/pdf', upsert: true });
                if (upErr) console.error('[FUNDAE-ALUMNOS] PDF upload error:', upErr);
                else {
                    await supabase
                        .from('fundae_alumnos')
                        .update({ ficha_pdf_path: pdfPath })
                        .eq('id', fichaId);
                }
            }

            // 4. Token usado
            await supabase
                .from('fundae_alumnos_tokens')
                .update({ used: true })
                .eq('token', rawToken);

            // 5. Limpiar bandera del expediente
            await supabase
                .from('fundae_seguimiento')
                .update({ enviar_alumnos_pendiente: false })
                .eq('id', fundaeId);

            setShowSuccessModal(true);
            setStep(3);
        } catch (err) {
            console.error(err);
            alert('Error al enviar las fichas: ' + (err.message || ''));
        } finally {
            setSubmitting(false);
        }
    };

    // ── RENDER ────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-main)' }}>
            <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-main)' }}>
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

    const a = alumnos[currentIdx] || emptyAlumno();

    return (
        <div className="min-h-screen overflow-x-hidden flex flex-col items-center justify-center p-4 sm:p-6 relative" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' }}>
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] size-[500px] rounded-full bg-primary/20 blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] size-[500px] rounded-full bg-primary/10 blur-[120px]" />
            </div>

            <div className="w-full max-w-5xl relative z-10">
                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.div key="s0" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -50 }}
                            className="glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl text-center max-w-xl mx-auto">
                            <div className="size-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <Mail className="text-primary size-8" />
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-variable-main mb-3">Fichas de Inscripción</h2>
                            <p className="text-variable-muted text-sm mb-8 leading-relaxed">
                                Vamos a registrar a los <strong className="text-primary">{numAsistentes}</strong> alumno{numAsistentes === 1 ? '' : 's'} de la formación bonificada FUNDAE.
                                <br />Para empezar, recibirás un código de verificación en:
                                <br /><span className="text-primary font-semibold mt-2 block">{tokenData?.email}</span>
                            </p>
                            <button onClick={handleRequestCode} disabled={resending}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed">
                                {resending ? <Loader2 className="animate-spin" /> : <><RefreshCcw className="group-hover:rotate-180 transition-all duration-700" size={20} /> Solicitar código</>}
                            </button>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div key="s1" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                            className="glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl text-center max-w-xl mx-auto">
                            <h2 className="text-2xl sm:text-3xl font-bold text-variable-main mb-2">Introduce el código</h2>
                            <p className="text-variable-muted text-sm mb-8">
                                Hemos enviado un código de 6 dígitos a <br />
                                <strong className="text-primary">{tokenData?.email}</strong>
                            </p>
                            <div className="flex justify-between gap-2 sm:gap-4 mb-8">
                                {otp.map((d, i) => (
                                    <input key={i} ref={el => otpRefs.current[i] = el} type="text" maxLength={1} value={d}
                                        onChange={e => handleOtpChange(e.target.value, i)}
                                        onKeyDown={e => handleOtpKeyDown(e, i)}
                                        className="size-12 sm:size-14 bg-white/5 border border-variable text-center text-xl font-bold rounded-2xl focus:border-primary/50 focus:outline-none transition-all text-variable-main"
                                        autoFocus={i === 0} />
                                ))}
                            </div>
                            <button onClick={handleVerify} disabled={verifying || otp.some(v => v === '')}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed mb-6">
                                {verifying ? <Loader2 className="animate-spin" /> : <>Verificar Código <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
                            </button>
                            <div className="pt-6 border-t border-variable">
                                <p className="text-xs text-variable-muted mb-4">¿No has recibido nada? Revisa el correo no deseado.</p>
                                <button onClick={handleRequestCode} disabled={resending || cooldown > 0}
                                    className="text-sm font-bold text-variable-muted hover:text-primary disabled:opacity-40 transition-colors flex items-center gap-2 mx-auto">
                                    <RefreshCcw size={14} className={resending ? 'animate-spin' : ''} />
                                    {cooldown > 0 ? `Reenviar en ${formatCooldown(cooldown)}` : 'Solicitar un nuevo código'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="s2" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="glass rounded-[2rem] p-6 lg:p-10 shadow-2xl w-full mx-auto">
                            {/* Header del wizard */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-variable">
                                <div className="flex items-center gap-3">
                                    <div className="size-11 bg-primary/10 rounded-xl flex items-center justify-center">
                                        <Users className="text-primary size-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl sm:text-2xl font-bold text-variable-main">Ficha de inscripción</h2>
                                        <p className="text-xs text-variable-muted">{fundaeRecord?.empresa || fundaeRecord?.razon_social}</p>
                                    </div>
                                </div>
                                <div className="text-sm text-variable-muted font-semibold">
                                    Alumno <span className="text-primary">{currentIdx + 1}</span> de <span className="text-primary">{numAsistentes}</span>
                                </div>
                            </div>

                            {/* Progreso */}
                            <div className="flex gap-1 mb-8">
                                {Array.from({ length: numAsistentes }).map((_, i) => (
                                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < currentIdx ? 'bg-primary' : i === currentIdx ? 'bg-primary/60' : 'bg-white/10'}`} />
                                ))}
                            </div>

                            {/* Form alumno */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Nombre *" value={a.nombre} onChange={v => updateAlumno(currentIdx, { nombre: v })} />
                                <Field label="Primer apellido *" value={a.apellido1} onChange={v => updateAlumno(currentIdx, { apellido1: v })} />
                                <Field label="Segundo apellido" value={a.apellido2} onChange={v => updateAlumno(currentIdx, { apellido2: v })} />
                                <Field label="DNI *" value={a.dni} onChange={v => updateAlumno(currentIdx, { dni: v.toUpperCase() })} />
                                <Field label="Correo electrónico *" type="email" value={a.email} onChange={v => updateAlumno(currentIdx, { email: v })} />
                                <Field label="Teléfono" value={a.telefono} onChange={v => updateAlumno(currentIdx, { telefono: v })} />
                                <Field label="Fecha de nacimiento *" type="date" value={a.fecha_nacimiento} onChange={v => updateAlumno(currentIdx, { fecha_nacimiento: v })} />
                                <label className="block">
                                    <span className="block text-xs font-semibold text-variable-muted mb-1.5 uppercase tracking-wide">Nivel de estudios *</span>
                                    <CustomSelect
                                        value={a.nivel_estudios}
                                        onChange={v => updateAlumno(currentIdx, { nivel_estudios: v })}
                                        options={NIVELES_ESTUDIOS}
                                        placeholder="Selecciona nivel..."
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-xs font-semibold text-variable-muted mb-1.5 uppercase tracking-wide">Categoría profesional *</span>
                                    <CustomSelect
                                        value={a.categoria_profesional}
                                        onChange={v => updateAlumno(currentIdx, { categoria_profesional: v })}
                                        options={CATEGORIAS_PROFESIONALES}
                                        placeholder="Selecciona categoría..."
                                    />
                                </label>
                                <Field label="Nº afiliación SS (NASS) *" value={a.nass} onChange={v => updateAlumno(currentIdx, { nass: v })} />
                                <Field label="Coste salarial bruto/hora (€)" type="number" step="0.01" value={a.coste_salarial_hora} onChange={v => updateAlumno(currentIdx, { coste_salarial_hora: v })} />
                            </div>

                            {/* Discapacidad */}
                            <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-variable">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input type="checkbox" className="mt-1" checked={!!a.discapacidad_33}
                                        onChange={e => updateAlumno(currentIdx, { discapacidad_33: e.target.checked })} />
                                    <span className="text-sm text-variable-main">El alumno tiene discapacidad reconocida igual o superior al 33%.</span>
                                </label>
                            </div>

                            {/* Solape */}
                            <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-variable">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input type="checkbox" className="mt-1" checked={!!a.solapa_horario}
                                        onChange={e => updateAlumno(currentIdx, { solapa_horario: e.target.checked, horas_solapadas: e.target.checked ? a.horas_solapadas : '' })} />
                                    <span className="text-sm text-variable-main">¿El horario del curso se solapa con el horario habitual de trabajo del alumno?</span>
                                </label>
                                {a.solapa_horario && (
                                    <div className="mt-4 max-w-xs">
                                        <Field label="Horas que se solapan *" type="number" step="0.5" value={a.horas_solapadas} onChange={v => updateAlumno(currentIdx, { horas_solapadas: v })} />
                                    </div>
                                )}
                            </div>

                            {/* Navegación */}
                            <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-variable">
                                <button onClick={handlePrev} disabled={currentIdx === 0}
                                    className="px-6 py-3 rounded-2xl border border-variable text-variable-main hover:bg-white/5 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                                    <ArrowLeft size={18} /> Anterior
                                </button>
                                <div className="flex-1" />
                                {currentIdx < numAsistentes - 1 ? (
                                    <button onClick={handleNext}
                                        className="px-6 py-3 rounded-2xl bg-primary text-white font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2">
                                        Siguiente alumno <ArrowRight size={18} />
                                    </button>
                                ) : (
                                    <button onClick={handleSubmitAll} disabled={submitting}
                                        className="px-6 py-3 rounded-2xl bg-primary text-white font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                                        {submitting ? <><Loader2 className="animate-spin" size={18} /> Enviando...</> : <><Save size={18} /> Firmar y enviar fichas</>}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div key="s3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            className="glass rounded-[2.5rem] p-10 sm:p-14 shadow-2xl text-center max-w-xl mx-auto">
                            <div className="size-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="text-emerald-400 size-12" />
                            </div>
                            <h2 className="text-3xl font-bold text-variable-main mb-3">¡Fichas enviadas!</h2>
                            <p className="text-variable-muted mb-8">
                                Hemos recibido las {numAsistentes} ficha{numAsistentes === 1 ? '' : 's'} de inscripción correctamente. AFCademIA procederá ahora con la matriculación de los alumnos en el campus.
                            </p>
                            <a href="https://afcademia.com" className="inline-block px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all">
                                Volver a AFCademIA
                            </a>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = 'text', step }) {
    return (
        <label className="block">
            <span className="block text-xs font-semibold text-variable-muted mb-1.5 uppercase tracking-wide">{label}</span>
            <input
                type={type}
                step={step}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-variable rounded-2xl text-variable-main focus:border-primary/50 focus:outline-none transition-all text-sm"
            />
        </label>
    );
}
