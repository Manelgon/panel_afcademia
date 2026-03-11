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
    ShieldAlert,
    Download,
    X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import logo_fundae from '../assets/logo_fundae.png';
import CustomSelect from '../components/CustomSelect';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    const [pdfBlob, setPdfBlob] = useState(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

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
                    razon_social: '',
                    cif: '',
                    telefono: fundae.telefono || '',
                    email: tData.email || '',
                    domicilio: '',
                    tipo_via: '',
                    nombre_via: '',
                    numero_via: '',
                    piso: '',
                    puerta: '',
                    poblacion: '',
                    codigo_postal: '',
                    provincia: '',
                    convenio_referencia: '',
                    cnae: '',
                    ccc: '',
                    num_medio_empleados: '',
                    num_asistentes: '',
                    prefijo_telefono: fundae.prefijo_telefono || '+34',
                    representante_empresa: '',
                    representante_nombre: '',
                    representante_apellido1: '',
                    representante_apellido2: '',
                    nif_nie_representante: ''
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

    // ── HELPER: Convertir imagen URL a base64 ────────────────────────
    const imageToBase64 = async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    };

    // ── HELPER: Generar el PDF combinado ─────────────────────────────
    const generatePDF = async (data) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 15;

        // Cargar logos como base64
        let logoAfcB64 = null;
        let logoFundaeB64 = null;
        try { logoAfcB64 = await imageToBase64(logo); } catch (_) { }
        try { logoFundaeB64 = await imageToBase64(logo_fundae); } catch (_) { }

        // ── Función header (se llama en cada página) ─────────────────
        const addHeader = () => {
            if (logoAfcB64) doc.addImage(logoAfcB64, 'PNG', margin, 8, 40, 14);
            if (logoFundaeB64) doc.addImage(logoFundaeB64, 'PNG', pageW - margin - 40, 8, 40, 14);
            doc.setDrawColor(230, 90, 30);
            doc.setLineWidth(0.5);
            doc.line(margin, 26, pageW - margin, 26);
        };

        // ──────────────────────────────────────────────────────────────
        // SECCIÓN 1: FICHA DE EMPRESA
        // ──────────────────────────────────────────────────────────────
        addHeader();

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(230, 90, 30);
        doc.text('FICHA DE EMPRESA', pageW / 2, 34, { align: 'center' });
        doc.setTextColor(40, 40, 40);

        const domicilioCompleto = [
            data.tipo_via, data.nombre_via, data.numero_via,
            data.piso ? `Piso ${data.piso}` : '',
            data.puerta ? `Pta. ${data.puerta}` : ''
        ].filter(Boolean).join(' ');

        const representanteNombre = [
            data.representante_nombre,
            data.representante_apellido1,
            data.representante_apellido2
        ].filter(Boolean).join(' ');

        const fichaRows = [
            ['Nombre comercial', data.empresa || ''],
            ['Razón social', data.razon_social || ''],
            ['C.I.F.', data.cif || ''],
            ['Teléfono', `${data.prefijo_telefono || ''}${data.telefono ? ' ' + data.telefono : ''}`],
            ['Email', data.email || ''],
            ['Domicilio', domicilioCompleto || data.domicilio || ''],
            ['Localidad / Población', data.poblacion || ''],
            ['Código Postal', data.codigo_postal || ''],
            ['Provincia', data.provincia || ''],
            ['CNAE (Actividad)', data.cnae || ''],
            ['Cód. Cuenta Cotización (CCC)', data.ccc || ''],
            ['Plantilla media (2025)', data.num_medio_empleados ? `${data.num_medio_empleados} trabajadores` : ''],
            ['Convenio de referencia', data.convenio_referencia || ''],
            ['Trabajadores a formar (estimado)', data.num_asistentes ? `${data.num_asistentes} personas` : ''],
            ['Representante legal', representanteNombre || ''],
            ['NIF/NIE representante', data.nif_nie_representante || ''],
        ];

        autoTable(doc, {
            startY: 38,
            head: [],
            body: fichaRows,
            theme: 'striped',
            styles: { fontSize: 9.5, cellPadding: 3.5, textColor: [40, 40, 40] },
            columnStyles: {
                0: { fontStyle: 'bold', fillColor: [255, 247, 242], textColor: [180, 65, 10], cellWidth: 72 },
                1: { cellWidth: pageW - margin * 2 - 72 }
            },
            margin: { left: margin, right: margin },
        });

        // ──────────────────────────────────────────────────────────────
        // SECCIÓN 2: ADHESIÓN CONTRATO DE ENCOMIENDA
        // ──────────────────────────────────────────────────────────────
        doc.addPage();
        addHeader();

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(230, 90, 30);
        doc.text('ADHESIÓN AL CONTRATO DE ENCOMIENDA DE FORMACIÓN', pageW / 2, 34, { align: 'center' });
        doc.setTextColor(40, 40, 40);

        // Texto legal del contrato
        const empresa = data.empresa || '_______________________';
        const cif = data.cif || '___________';
        const representante = representanteNombre || '_______________________';
        const nifRep = data.nif_nie_representante || '___________';
        const hoy = new Date();
        const fechaStr = `${hoy.getDate()} de ${hoy.toLocaleString('es-ES', { month: 'long' })} de ${hoy.getFullYear()}`;

        const textoContrato = [
            `En _____________, a ${fechaStr}.`,
            '',
            'REUNIDOS',
            '',
            `De una parte, D./Dña. ${representante}, con NIF/NIE ${nifRep}, actuando en nombre y representación de la empresa ${empresa} con C.I.F. ${cif}, en adelante «LA EMPRESA».`,
            '',
            `De otra parte, AFC Academia S.L., en adelante «AFC ACADEMIA», actuando en calidad de entidad organizadora de acciones formativas bonificadas al amparo del sistema de formación profesional para el empleo.`,
            '',
            'EXPONEN',
            '',
            '1.º Que AFC Academia S.L. está debidamente inscrita en el registro correspondiente para la organización e impartición de formación bonificada a través de la Fundación Estatal para la Formación en el Empleo (FUNDAE).',
            '',
            '2.º Que La Empresa desea realizar acciones formativas para sus trabajadores con cargo a la bonificación a la que tiene derecho según la normativa vigente de formación profesional para el empleo.',
            '',
            '3.º Que ambas partes tienen plena capacidad jurídica para suscribir el presente documento.',
            '',
            'ACUERDAN',
            '',
            'PRIMERO. La Empresa encomienda a AFC Academia S.L. la organización y gestión de las acciones formativas para sus trabajadores, incluyendo la tramitación de las bonificaciones ante FUNDAE.',
            '',
            'SEGUNDO. AFC Academia S.L. se compromete a realizar las gestiones necesarias para la correcta tramitación de la formación bonificada, conforme a la legislación vigente.',
            '',
            'TERCERO. La Empresa autoriza expresamente a AFC Academia S.L. a actuar en su nombre ante FUNDAE para todos los trámites relacionados con las acciones formativas objeto del presente acuerdo.',
            '',
            'CUARTO. Ambas partes se comprometen a facilitar mutuamente la información y documentación necesaria para el correcto desarrollo de las acciones formativas.',
            '',
            'QUINTO. El presente acuerdo tendrá vigencia durante el ejercicio en curso y podrá prorrogarse mediante acuerdo expreso de ambas partes.',
            '',
            'Y en prueba de conformidad, firman el presente documento por duplicado en el lugar y fecha indicados.',
        ];

        let yPos = 40;
        const lineHeight = 5.2;
        const maxWidth = pageW - margin * 2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);

        for (const line of textoContrato) {
            // Detectar títulos en mayúsculas
            const isTitle = line === 'REUNIDOS' || line === 'EXPONEN' || line === 'ACUERDAN';
            if (isTitle) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(230, 90, 30);
            } else {
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(40, 40, 40);
            }

            if (line === '') {
                yPos += lineHeight * 0.5;
                continue;
            }

            const lines = doc.splitTextToSize(line, maxWidth);
            for (const l of lines) {
                if (yPos + lineHeight > pageH - 50) {
                    doc.addPage();
                    addHeader();
                    yPos = 34;
                }
                doc.text(l, margin, yPos);
                yPos += lineHeight;
            }
        }

        // ── Bloques de firma ──────────────────────────────────────────
        if (yPos + 50 > pageH - 10) {
            doc.addPage();
            addHeader();
            yPos = 34;
        }

        yPos += 10;
        const col1X = margin;
        const col2X = pageW / 2 + 5;
        const colW = pageW / 2 - margin - 5;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);

        // Títulos de firma
        doc.text('Por La Empresa', col1X, yPos);
        doc.text('Por AFC Academia S.L.', col2X, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('(Sello y firma)', col1X, yPos);
        doc.text('(Sello y firma)', col2X, yPos);
        yPos += 28;

        // Líneas de firma
        doc.setDrawColor(100, 100, 100);
        doc.setLineWidth(0.3);
        doc.line(col1X, yPos, col1X + colW, yPos);
        doc.line(col2X, yPos, col2X + colW, yPos);
        yPos += 5;

        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(representante || 'Representante de la empresa', col1X, yPos);
        doc.text('AFC Academia S.L.', col2X, yPos);

        // Número de página en cada página
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(`Página ${i} de ${totalPages}`, pageW / 2, pageH - 6, { align: 'center' });
        }

        return doc.output('blob');
    };

    // 3. Enviar Formulario
    const handleSubmitForm = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // 1. Actualizar el expediente de FUNDAE
            const { data: updatedRows, error: fError } = await supabase
                .from('fundae_seguimiento')
                .update({
                    empresa: formData.empresa,
                    razon_social: formData.razon_social,
                    cif: formData.cif,
                    telefono: formData.telefono,
                    prefijo_telefono: formData.prefijo_telefono,
                    email: formData.email,
                    tipo_via: formData.tipo_via,
                    nombre_via: formData.nombre_via,
                    numero_via: formData.numero_via,
                    piso: formData.piso,
                    puerta: formData.puerta,
                    poblacion: formData.poblacion,
                    codigo_postal: formData.codigo_postal,
                    provincia: formData.provincia,
                    convenio_referencia: formData.convenio_referencia,
                    cnae: formData.cnae,
                    ccc: formData.ccc,
                    num_medio_empleados: formData.num_medio_empleados,
                    num_asistentes: parseInt(formData.num_asistentes) || 0,
                    representante_nombre: formData.representante_nombre,
                    representante_apellido1: formData.representante_apellido1,
                    representante_apellido2: formData.representante_apellido2,
                    nif_nie_representante: formData.nif_nie_representante,
                    formulario_cumplimentado: true,
                    formulario_enviado: true,
                    estado_formulario: 'cumplimentado',
                })
                .eq('id', tokenData.fundae_id)
                .select();

            if (fError) throw fError;
            if (!updatedRows || updatedRows.length === 0) {
                throw new Error('No se pudo guardar en la base de datos. Posible problema de permisos (RLS). Contacte con soporte.');
            }
            console.log('✅ Datos guardados correctamente:', updatedRows[0]);

            // 2. Marcar el token como usado
            await supabase
                .from('fundae_form_tokens')
                .update({ used: true })
                .eq('token', token);

            // 3. Generar el PDF
            const blob = await generatePDF(formData);
            setPdfBlob(blob);

            // 4. Convertir PDF a base64 y enviar al webhook de n8n para email
            try {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    const base64data = reader.result.split(',')[1]; // quitar "data:application/pdf;base64,"
                    const webhookUrl = import.meta.env.VITE_WEBHOOK_PDF_EMAIL;
                    if (webhookUrl) {
                        fetch(webhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                email: formData.email,
                                empresa: formData.empresa,
                                representante: [formData.representante_nombre, formData.representante_apellido1, formData.representante_apellido2].filter(Boolean).join(' '),
                                cif: formData.cif,
                                pdf_base64: base64data,
                                pdf_filename: `Expediente_FUNDAE_${formData.empresa || 'empresa'}_${new Date().getFullYear()}.pdf`
                            })
                        }).catch(() => { }); // fire-and-forget
                    }
                };
            } catch (_) { } // No bloquear si falla el envío por email

            setShowSuccessModal(true);

        } catch (err) {
            alert('Error al enviar: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ── HELPER: Descargar PDF ─────────────────────────────────────────
    const handleDownloadPDF = () => {
        if (!pdfBlob) return;
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Expediente_FUNDAE_${formData.empresa || 'empresa'}_${new Date().getFullYear()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
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
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 pb-6 border-b border-variable">
                                {/* Left: AFCademIA Logo + Formulario FUNDAE text */}
                                <div className="flex items-center gap-4 shrink-0 overflow-hidden">
                                    <div className="size-16 bg-white/80 rounded-2xl flex items-center justify-center shadow-sm p-3 border border-variable/10 overflow-hidden backdrop-blur-sm shrink-0">
                                        <img src={logo} alt="AFCademIA" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2 select-none">
                                            <span className="text-lg sm:text-xl font-bold text-[#004b90] tracking-tight">Formulario</span>
                                            <span className="text-xl sm:text-3xl font-black italic text-[#ff7900] leading-none">FUNDAE</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-gradient-to-r from-[#004b90] to-[#ff7900] rounded-full mt-1 opacity-20"></div>
                                    </div>
                                </div>

                                {/* Center: FUNDAE Logo (no borders, adapted height) */}
                                <div className="flex-1 flex items-center justify-center h-32 pointer-events-none select-none">
                                    <img src={logo_fundae} alt="FUNDAE Logo" className="h-full w-auto object-contain opacity-90" />
                                </div>

                                {/* Right: Datos del Expediente */}
                                <div className="lg:text-right shrink-0">
                                    <h2 className="text-lg sm:text-xl font-bold text-variable-main">Datos del Expediente</h2>
                                    <p className="text-[10px] text-variable-muted uppercase font-black tracking-wider mt-0.5 opacity-50">Gestión de Formación</p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmitForm} className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-12 mt-8">
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
                                                    readOnly
                                                    value={formData.empresa}
                                                    className="w-full bg-black/5 border border-variable/50 rounded-xl px-3 py-2.5 text-sm text-variable-main/60 cursor-not-allowed"
                                                    placeholder="Ej. Mi Empresa"
                                                    title="Este campo no se puede modificar"
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
                                                        readOnly
                                                        value={formData.telefono}
                                                        className="flex-1 bg-black/5 border border-variable/50 rounded-xl px-3 py-2.5 text-sm text-variable-main/60 cursor-not-allowed"
                                                        placeholder="600 000 000"
                                                        title="Este campo no se puede modificar"
                                                    />
                                                </div>
                                            </div>

                                            {/* Email Solo debajo */}
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-bold text-variable-muted uppercase tracking-widest ml-1">Email de Contacto</label>
                                                <input
                                                    type="email"
                                                    required
                                                    readOnly
                                                    value={formData.email}
                                                    className="w-full bg-black/5 border border-variable/50 rounded-xl px-3 py-2.5 text-sm text-variable-main/60 cursor-not-allowed"
                                                    placeholder="empresa@mail.com"
                                                    title="El email no se puede modificar"
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
                                                        className="w-full sm:w-32 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
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
                                                        placeholder="Segundo Apellido (opcional)"
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
                                                    className="w-full sm:w-32 bg-black/10 border border-variable rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-variable-main transition-all placeholder:text-variable-muted/30"
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

                    {/* Pantalla 3: Éxito (legacy fallback) */}
                    {step === 3 && !showSuccessModal && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass rounded-[2.5rem] p-8 sm:p-12 shadow-2xl text-center"
                        >
                            <div className="size-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                                <CheckCircle className="text-emerald-500 size-12" />
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

                {/* ── MODAL DE ÉXITO CON PDF ────────────────────────────── */}
                <AnimatePresence>
                    {showSuccessModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
                        >
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0, y: 30 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                                className="relative bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl max-w-md w-full text-center border border-primary/10"
                            >
                                {/* Icono animado */}
                                <div className="relative size-24 mx-auto mb-6">
                                    <div className="size-24 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                        <CheckCircle className="text-emerald-500 size-12" />
                                    </div>
                                    <motion.div
                                        initial={{ scale: 1, opacity: 0.5 }}
                                        animate={{ scale: 1.8, opacity: 0 }}
                                        transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                                        className="absolute inset-0 bg-emerald-500/20 rounded-full"
                                    />
                                </div>

                                <h2 className="text-2xl sm:text-3xl font-black text-zinc-800 dark:text-white mb-3">
                                    ¡Expediente Guardado!
                                </h2>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-2">
                                    Los datos han sido guardados correctamente en el sistema.
                                </p>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed mb-8">
                                    Descarga el PDF con la <strong className="text-primary">Ficha de Empresa</strong> y el <strong className="text-primary">Contrato de Encomienda</strong> para firmarlo y enviárnoslo.
                                </p>

                                {/* Botones */}
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={handleDownloadPDF}
                                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 bg-primary text-white rounded-2xl font-bold text-sm uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/30"
                                    >
                                        <Download size={18} />
                                        Descargar PDF
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowSuccessModal(false);
                                            setStep(3);
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold text-sm uppercase tracking-wider hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.98] transition-all"
                                    >
                                        <X size={18} />
                                        Salir
                                    </button>
                                </div>

                                <p className="text-xs text-zinc-400 mt-6 italic">
                                    Nuestro equipo revisará la documentación y se pondrá en contacto contigo.
                                </p>
                            </motion.div>
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
