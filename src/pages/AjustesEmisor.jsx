import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, Building2, Upload, ImageIcon, X, Plug, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';
import { useUnsavedChanges } from '../context/UnsavedChangesContext';

const TEXT_KEYS = [
    'emisor_name',
    'emisor_address',
    'emisor_city',
    'emisor_cp',
    'emisor_cif',
    'emisor_phone',
    'colegiado_nombre',
    'colegio_ciudad',
    'emisor_iban'
];

const IMG_TYPES = ['logo', 'firma', 'header'];
const BUCKET = 'doc-assets';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

const INITIAL_TEXT = TEXT_KEYS.reduce((acc, k) => ({ ...acc, [k]: '' }), {});

// Resize en cliente (sustituye a sharp del backend de Serincosol)
const resizeToPng = (file, maxW = 800, maxH = 400) => new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('No se pudo procesar la imagen'));
            resolve(blob);
        }, 'image/png', 0.92);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
});

const publicUrl = (path) => {
    if (!path) return '';
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust para que el preview se actualice tras subir
    return data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : '';
};

export default function AjustesEmisor() {
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const { setDirty } = useUnsavedChanges();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [textFields, setTextFields] = useState(INITIAL_TEXT);
    const [savedTextFields, setSavedTextFields] = useState(INITIAL_TEXT);
    const [images, setImages] = useState({
        logo: { url: '', path: '', uploading: false },
        firma: { url: '', path: '', uploading: false },
        header: { url: '', path: '', uploading: false }
    });

    // Integración evolCampus
    const [evol, setEvol] = useState({
        configured: false,
        clientid: '',
        keyInput: '',
        clientidInput: '',
        showKey: false,
        testing: false,
        savingCreds: false,
        connection: null,   // { ok, message, detail? }
    });

    // Detecta si los textos han cambiado respecto al último guardado.
    // Las imágenes se persisten en el momento de subirlas, no necesitan dirty.
    useEffect(() => {
        const dirty = TEXT_KEYS.some((k) => (textFields[k] || '') !== (savedTextFields[k] || ''));
        setDirty(dirty);
    }, [textFields, savedTextFields, setDirty]);

    // Limpia el flag al desmontar (cambio de ruta tras confirmar)
    useEffect(() => () => setDirty(false), [setDirty]);

    const inputRefs = {
        logo: useRef(null),
        firma: useRef(null),
        header: useRef(null)
    };

    useEffect(() => {
        loadSettings();
        loadEvolStatus();
    }, []);

    const loadEvolStatus = async () => {
        try {
            const { data, error } = await supabase.rpc('has_evolcampus_credentials');
            if (error) {
                setEvol(p => ({ ...p, configured: false, clientid: '' }));
                return;
            }
            const configured = !!data?.configured;
            setEvol(p => ({
                ...p,
                configured,
                clientid: data?.clientid || '',
                clientidInput: data?.clientid || '',
            }));
            // Si está configurado, comprobar conexión en vivo
            if (configured) testConnection();
        } catch (_) {
            setEvol(p => ({ ...p, configured: false }));
        }
    };

    const testConnection = async () => {
        setEvol(p => ({ ...p, testing: true }));
        try {
            const { data, error } = await supabase.functions.invoke('evolcampus-test-connection', { body: {} });
            if (error) {
                setEvol(p => ({ ...p, testing: false, connection: { ok: false, message: error.message } }));
                return;
            }
            setEvol(p => ({
                ...p,
                testing: false,
                configured: !!data?.configured,
                clientid: data?.clientid || p.clientid,
                connection: { ok: !!data?.ok, message: data?.message || '', detail: data?.detail }
            }));
        } catch (err) {
            setEvol(p => ({ ...p, testing: false, connection: { ok: false, message: err.message || 'Error de red' } }));
        }
    };

    const saveCredentials = async () => {
        const cid = (evol.clientidInput || '').trim();
        const key = (evol.keyInput || '').trim();
        if (!cid || !key) {
            showNotification('Indica clientid y key.', 'error');
            return;
        }
        setEvol(p => ({ ...p, savingCreds: true }));
        await withLoading(async () => {
            try {
                const { error } = await supabase.rpc('set_evolcampus_credentials', { p_clientid: cid, p_key: key });
                if (error) {
                    showNotification('Error guardando credenciales: ' + error.message, 'error');
                    return;
                }
                // Limpiamos la key del input por seguridad y comprobamos conexión.
                setEvol(p => ({ ...p, keyInput: '', configured: true, clientid: cid }));
                await testConnection();
                showNotification('✅ Credenciales guardadas.');
            } catch (err) {
                showNotification('Error: ' + (err.message || ''), 'error');
            }
        }, 'Guardando credenciales y probando conexión...');
        setEvol(p => ({ ...p, savingCreds: false }));
    };

    const loadSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('company_settings')
                .select('setting_key, setting_value');
            if (error) throw error;

            const map = {};
            (data || []).forEach((row) => { map[row.setting_key] = row.setting_value; });

            const loaded = TEXT_KEYS.reduce((acc, k) => ({ ...acc, [k]: map[k] || '' }), {});
            setTextFields(loaded);
            setSavedTextFields(loaded);
            setImages({
                logo:   { url: publicUrl(map.logo_path),   path: map.logo_path   || '', uploading: false },
                firma:  { url: publicUrl(map.firma_path),  path: map.firma_path  || '', uploading: false },
                header: { url: publicUrl(map.header_path), path: map.header_path || '', uploading: false }
            });
        } catch (err) {
            showNotification(`Error cargando ajustes: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveText = async (e) => {
        if (e?.preventDefault) e.preventDefault();
        setSaving(true);
        await withLoading(async () => {
            try {
                const rows = TEXT_KEYS.map((k) => ({
                    setting_key: k,
                    setting_value: String(textFields[k] ?? ''),
                    updated_at: new Date().toISOString()
                }));
                const { error } = await supabase
                    .from('company_settings')
                    .upsert(rows, { onConflict: 'setting_key' });
                if (error) throw error;
                setSavedTextFields(textFields);
                showNotification('Datos del emisor actualizados');
            } catch (err) {
                showNotification(`Error al guardar: ${err.message}`, 'error');
            } finally {
                setSaving(false);
            }
        }, 'Guardando datos del emisor...');
    };

    const handleUpload = async (file, type) => {
        if (!file) return;
        if (!ALLOWED_MIMES.includes(file.type)) {
            showNotification('Solo PNG, JPG o WebP', 'error');
            return;
        }
        if (file.size > MAX_BYTES) {
            showNotification('La imagen no puede superar 5 MB', 'error');
            return;
        }

        setImages((p) => ({ ...p, [type]: { ...p[type], uploading: true } }));

        await withLoading(async () => {
            try {
                const blob = await resizeToPng(file);
                const path = `company/${type}.png`;

                const { error: upErr } = await supabase.storage
                    .from(BUCKET)
                    .upload(path, blob, {
                        contentType: 'image/png',
                        upsert: true,
                        cacheControl: '3600'
                    });
                if (upErr) throw upErr;

                const { error: cfgErr } = await supabase
                    .from('company_settings')
                    .upsert(
                        { setting_key: `${type}_path`, setting_value: path, updated_at: new Date().toISOString() },
                        { onConflict: 'setting_key' }
                    );
                if (cfgErr) throw cfgErr;

                setImages((p) => ({
                    ...p,
                    [type]: { url: publicUrl(path), path, uploading: false }
                }));
                showNotification(`${capitalize(type)} actualizado`);
            } catch (err) {
                showNotification(`Error al subir: ${err.message}`, 'error');
                setImages((p) => ({ ...p, [type]: { ...p[type], uploading: false } }));
            }
        }, `Subiendo ${type}...`);
    };

    const handleRemove = async (type) => {
        const current = images[type];
        if (!current.path) return;
        await withLoading(async () => {
            try {
                await supabase.storage.from(BUCKET).remove([current.path]);
                const { error } = await supabase
                    .from('company_settings')
                    .upsert(
                        { setting_key: `${type}_path`, setting_value: '', updated_at: new Date().toISOString() },
                        { onConflict: 'setting_key' }
                    );
                if (error) throw error;
                setImages((p) => ({ ...p, [type]: { url: '', path: '', uploading: false } }));
                showNotification(`${capitalize(type)} eliminado`);
            } catch (err) {
                showNotification(`Error al eliminar: ${err.message}`, 'error');
            }
        }, `Eliminando ${type}...`);
    };

    const handleFileChange = (e, type) => {
        const file = e.target.files?.[0];
        if (!file) return;
        handleUpload(file, type);
        e.target.value = '';
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div className="flex items-center gap-4">
                        <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                            <Building2 size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">
                                Ajustes del Emisor
                            </h1>
                            <p className="text-variable-muted text-sm">
                                Datos e imágenes corporativas que se usan en los PDFs generados.
                            </p>
                        </div>
                    </div>
                </header>

                {loading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : (
                    <section className="w-full glass rounded-3xl p-6 sm:p-8 border border-variable">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            {/* COLUMNA IZQUIERDA — DATOS */}
                            <div>
                                <h2 className="font-bold text-variable-main mb-6 text-sm uppercase tracking-wider">
                                    Datos de la empresa
                                </h2>

                                <form onSubmit={handleSaveText} className="space-y-5">
                                    <Field label="Nombre de la empresa" placeholder="AFC Academia S.L."
                                        value={textFields.emisor_name}
                                        onChange={(v) => setTextFields((p) => ({ ...p, emisor_name: v }))} />

                                    <Field label="Dirección" placeholder="C/ Ejemplo 1, 1º A"
                                        value={textFields.emisor_address}
                                        onChange={(v) => setTextFields((p) => ({ ...p, emisor_address: v }))} />

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <Field label="Municipio" placeholder="Málaga"
                                            value={textFields.emisor_city}
                                            onChange={(v) => setTextFields((p) => ({ ...p, emisor_city: v }))} />
                                        <Field label="Código Postal" placeholder="29010"
                                            value={textFields.emisor_cp}
                                            onChange={(v) => setTextFields((p) => ({ ...p, emisor_cp: v }))} />
                                        <Field label="CIF" placeholder="B12345678"
                                            value={textFields.emisor_cif}
                                            onChange={(v) => setTextFields((p) => ({ ...p, emisor_cif: v }))} />
                                    </div>

                                    <Field label="Teléfono" type="tel" placeholder="+34 952 00 00 00"
                                        value={textFields.emisor_phone}
                                        onChange={(v) => setTextFields((p) => ({ ...p, emisor_phone: v }))}
                                        hint="Teléfono de contacto. Puede aparecer en documentos." />

                                    <Field label="Nombre del Administrador Colegiado" placeholder="Nombre Apellidos"
                                        value={textFields.colegiado_nombre}
                                        onChange={(v) => setTextFields((p) => ({ ...p, colegiado_nombre: v }))}
                                        hint="Aparece en certificados firmados." />

                                    <Field label="Provincia del Colegio Profesional" placeholder="Málaga"
                                        value={textFields.colegio_ciudad}
                                        onChange={(v) => setTextFields((p) => ({ ...p, colegio_ciudad: v }))} />

                                    <Field label="N.º de cuenta (IBAN)" placeholder="ES00 0000 0000 0000 0000 0000"
                                        mono
                                        value={textFields.emisor_iban}
                                        onChange={(v) => setTextFields((p) => ({ ...p, emisor_iban: v }))}
                                        hint="Aparece en facturas como N.º c/c ingreso." />

                                    {/* Botón submit oculto para permitir Enter en el formulario */}
                                    <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
                                </form>
                            </div>

                            {/* COLUMNA DERECHA — IMÁGENES */}
                            <div className="space-y-6">
                                <h2 className="font-bold text-variable-main text-sm uppercase tracking-wider">
                                    Imágenes corporativas
                                </h2>

                                <ImageUploadCard
                                    label="Header / Cabecera de PDFs"
                                    hint="Imagen panorámica para la cabecera de futuros PDFs. Recomendado 1200×200 px PNG."
                                    image={images.header}
                                    inputRef={inputRefs.header}
                                    onPick={() => inputRefs.header.current?.click()}
                                    onChange={(e) => handleFileChange(e, 'header')}
                                    onRemove={() => handleRemove('header')}
                                    wide
                                />

                                <ImageUploadCard
                                    label="Logo de la empresa"
                                    hint="Logo corporativo (login y otros elementos)."
                                    image={images.logo}
                                    inputRef={inputRefs.logo}
                                    onPick={() => inputRefs.logo.current?.click()}
                                    onChange={(e) => handleFileChange(e, 'logo')}
                                    onRemove={() => handleRemove('logo')}
                                />

                                <ImageUploadCard
                                    label="Imagen de firma"
                                    hint="Aparece en el bloque de firma del PDF FUNDAE. PNG con fondo transparente recomendado."
                                    image={images.firma}
                                    inputRef={inputRefs.firma}
                                    onPick={() => inputRefs.firma.current?.click()}
                                    onChange={(e) => handleFileChange(e, 'firma')}
                                    onRemove={() => handleRemove('firma')}
                                />
                            </div>
                        </div>

                        {/* Botón Guardar — esquina inferior derecha de la tarjeta */}
                        <div className="mt-8 pt-6 border-t border-variable flex justify-end">
                            <button
                                type="button"
                                onClick={handleSaveText}
                                disabled={saving}
                                className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                Guardar datos
                            </button>
                        </div>
                    </section>
                )}

                {/* Integración evolCampus */}
                {!loading && (
                    <section className="glass rounded-[2rem] p-8 border border-variable mt-6">
                        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                    <Plug size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-variable-main">Integración evolCampus</h2>
                                    <p className="text-xs text-variable-muted mt-1">
                                        Credenciales de la API para sincronizar alumnos, cursos y matrículas.
                                    </p>
                                </div>
                            </div>
                            {/* Badge de estado */}
                            {evol.testing ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                    <Loader2 size={12} className="animate-spin" /> Comprobando...
                                </span>
                            ) : evol.connection?.ok ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    <CheckCircle2 size={12} /> Conectado
                                </span>
                            ) : evol.configured ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    <AlertCircle size={12} /> Sin conexión
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                    <AlertCircle size={12} /> Sin configurar
                                </span>
                            )}
                        </div>

                        {evol.connection && !evol.testing && (
                            <div className={`rounded-2xl p-3 mb-5 text-xs ${evol.connection.ok ? 'bg-emerald-500/5 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/5 border border-rose-500/20 text-rose-400'}`}>
                                {evol.connection.message}
                                {evol.connection.detail && (
                                    <p className="opacity-70 mt-1 font-mono break-all">{evol.connection.detail}</p>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field
                                label="Client ID"
                                value={evol.clientidInput}
                                onChange={(v) => setEvol(p => ({ ...p, clientidInput: v }))}
                                placeholder="174989"
                                mono
                            />
                            <label className="block">
                                <span className="text-sm font-semibold text-variable-main">Key</span>
                                <div className="relative mt-2">
                                    <input
                                        type={evol.showKey ? 'text' : 'password'}
                                        value={evol.keyInput}
                                        onChange={(e) => setEvol(p => ({ ...p, keyInput: e.target.value }))}
                                        placeholder={evol.configured ? '•••••••• (configurada — vacío para no cambiar)' : 'Pega aquí la key'}
                                        className="w-full bg-white/5 border border-variable rounded-xl px-4 py-3 pr-11 focus:outline-none focus:border-primary/50 text-variable-main transition-all font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setEvol(p => ({ ...p, showKey: !p.showKey }))}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-variable-muted hover:text-primary"
                                        title={evol.showKey ? 'Ocultar' : 'Mostrar'}
                                    >
                                        {evol.showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {evol.configured && (
                                    <p className="text-[10px] text-variable-muted mt-1.5">
                                        La key se mantiene oculta por seguridad. Deja el campo vacío para no cambiarla.
                                    </p>
                                )}
                            </label>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 mt-6">
                            <button
                                type="button"
                                onClick={testConnection}
                                disabled={evol.testing || !evol.configured}
                                className="px-5 py-3 glass rounded-2xl font-bold text-variable-muted hover:text-primary transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {evol.testing ? <Loader2 className="animate-spin" size={16} /> : <Plug size={16} />}
                                Probar conexión
                            </button>
                            <div className="flex-1" />
                            <button
                                type="button"
                                onClick={saveCredentials}
                                disabled={evol.savingCreds || !evol.clientidInput.trim() || !evol.keyInput.trim()}
                                className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                            >
                                {evol.savingCreds ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                Guardar y conectar
                            </button>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}

// ─── helpers ───────────────────────────────────────────────────────
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function Field({ label, value, onChange, placeholder, type = 'text', hint, mono = false }) {
    return (
        <label className="block">
            <span className="text-sm font-semibold text-variable-main">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`mt-1.5 w-full rounded-2xl bg-white/5 border border-variable px-4 py-3 text-sm text-variable-main placeholder:text-variable-muted focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition ${mono ? 'font-mono tracking-wide' : ''}`}
            />
            {hint && <p className="text-xs text-variable-muted mt-1.5">{hint}</p>}
        </label>
    );
}

function ImageUploadCard({ label, hint, image, inputRef, onPick, onChange, onRemove, wide = false }) {
    const hasImage = !!image.path;

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-variable-main">{label}</p>
                {hasImage && (
                    <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 rounded-md px-2 py-0.5 uppercase tracking-wider">
                        Personalizado
                    </span>
                )}
            </div>

            <div className={`border-2 border-dashed border-variable rounded-2xl p-4 flex flex-col items-center gap-3 justify-center bg-white/5 ${wide ? 'min-h-[120px]' : 'min-h-[160px]'}`}>
                {image.uploading ? (
                    <Loader2 className="animate-spin text-primary" size={28} />
                ) : image.url ? (
                    <>
                        <img
                            src={image.url}
                            alt={label}
                            className={`object-contain rounded-lg ${wide ? 'max-h-24 w-full' : 'max-h-28'}`}
                        />
                        <div className="flex gap-2 mt-1 flex-wrap justify-center">
                            <button type="button" onClick={onPick}
                                className="flex items-center gap-1.5 text-xs text-variable-main hover:text-primary border border-variable rounded-xl px-3 py-1.5 transition">
                                <Upload size={14} /> Cambiar
                            </button>
                            {hasImage && (
                                <button type="button" onClick={onRemove}
                                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-500/30 rounded-xl px-3 py-1.5 transition">
                                    <X size={14} /> Quitar
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <ImageIcon className="text-variable-muted" size={28} />
                        <button type="button" onClick={onPick}
                            className="flex items-center gap-2 text-sm font-semibold text-variable-main hover:text-primary border border-variable rounded-xl px-4 py-2 transition">
                            <Upload size={16} /> Subir imagen
                        </button>
                    </>
                )}
            </div>

            <p className="text-xs text-variable-muted mt-2">{hint}</p>

            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onChange}
            />
        </div>
    );
}
