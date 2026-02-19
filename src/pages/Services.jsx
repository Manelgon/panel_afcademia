import React, { useState, useEffect } from 'react';
import {
    Briefcase,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Edit,
    Trash2,
    CheckCircle2,
    XCircle,
    X,
    ShieldCheck,
    Type,
    FileText,
    DollarSign,
    Clock,
    Sun,
    Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import { useAuth } from '../context/AuthContext';

export default function Services() {
    const { darkMode, toggleTheme } = useTheme();
    const { profile: currentProfile } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [servicesList, setServicesList] = useState([]);
    const [fetchError, setFetchError] = useState(null);

    const defaultForm = {
        name: '',
        description: '',
        price: '',
        is_active: true
    };
    const [formData, setFormData] = useState(defaultForm);
    const [editingServiceId, setEditingServiceId] = useState(null);

    const fetchServices = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const { data, error } = await supabase
                .from('services')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setServicesList(data || []);
        } catch (error) {
            console.error('Error fetching services:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            setFetchError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveService = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const serviceData = {
                ...formData,
                price: formData.price ? parseFloat(formData.price) : null
            };

            if (editingServiceId) {
                const { error } = await supabase
                    .from('services')
                    .update(serviceData)
                    .eq('id', editingServiceId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('services')
                    .insert([serviceData]);
                if (error) throw error;
            }

            setFormData(defaultForm);
            setEditingServiceId(null);
            setIsModalOpen(false);
            fetchServices();
        } catch (err) {
            console.error('Error saving service:', err);
            const msg = err.message || (typeof err === 'string' ? err : 'Error desconocido');
            const details = err.details ? ` (${err.details})` : '';
            alert(`Error al guardar servicio: ${msg}${details}`);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (service) => {
        setFormData({
            name: service.name || '',
            description: service.description || '',
            price: service.price || '',
            is_active: service.is_active
        });
        setEditingServiceId(service.id);
        setIsModalOpen(true);
    };

    const handleDeleteService = async (id) => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar este servicio definitivamente?')) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('services')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchServices();
        } catch (err) {
            console.error('Error deleting service:', err);
            alert(`Error al eliminar: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingServiceId(null);
        setFormData(defaultForm);
    };

    const toggleServiceStatus = async (id, currentStatus) => {
        try {
            const { error } = await supabase
                .from('services')
                .update({ is_active: !currentStatus })
                .eq('id', id);

            if (error) throw error;
            fetchServices();
        } catch (error) {
            console.error('Error updating service status:', error);
        }
    };

    useEffect(() => {
        fetchServices();

        // Realtime subscription
        const channel = supabase
            .channel('services-db-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'services' },
                () => fetchServices()
            )
            .subscribe();

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
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Catálogo de Servicios</h1>
                        <p className="text-variable-muted">Gestiona los servicios y soluciones que ofreces a tus clientes</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        <button
                            onClick={fetchServices}
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
                            className="flex-1 sm:flex-none bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                        >
                            <Plus size={20} /> <span className="whitespace-nowrap">Nuevo Servicio</span>
                        </button>
                    </div>
                </header>

                <DataTable
                    data={servicesList}
                    loading={loading}
                    columns={[
                        {
                            key: 'name',
                            label: 'Servicio',
                            render: (service) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                        <Briefcase size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{service.name}</p>
                                        <p className="text-xs text-variable-muted line-clamp-1 max-w-xs">{service.description}</p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'price',
                            label: 'Precio Base',
                            render: (service) => (
                                <span className="font-mono font-bold text-variable-main">
                                    {service.price ? `€${service.price}` : 'Consultar'}
                                </span>
                            ),
                        },
                        {
                            key: 'is_active',
                            label: 'Estado',
                            render: (service) => (
                                <button
                                    onClick={() => toggleServiceStatus(service.id, service.is_active)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${service.is_active
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                                        }`}
                                >
                                    {service.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                    {service.is_active ? 'Activo' : 'Inactivo'}
                                </button>
                            ),
                        },
                        {
                            key: 'created_at',
                            label: 'Añadido',
                            render: (service) => (
                                <span className="text-variable-muted text-sm italic">
                                    {new Date(service.created_at).toLocaleDateString()}
                                </span>
                            ),
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (service) => (
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => handleEditClick(service)}
                                        className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-all"
                                        title="Editar Servicio"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteService(service.id)}
                                        className="p-2 glass rounded-xl text-variable-muted hover:text-rose-500 transition-all"
                                        title="Eliminar Servicio"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ),
                        }
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
                            onClick={handleCloseModal}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 overflow-y-auto max-h-[90vh] shadow-2xl"
                        >
                            <button onClick={handleCloseModal} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-variable-muted hover:text-primary transition-colors z-10">
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2 text-variable-main">
                                {editingServiceId ? 'Editar Servicio' : 'Nuevo Servicio'}
                            </h2>
                            <p className="text-variable-muted mb-8 italic text-sm sm:text-base">
                                {editingServiceId ? 'Actualiza los detalles del servicio seleccionado' : 'Define un nuevo servicio para tu catálogo comercial'}
                            </p>

                            <form onSubmit={handleSaveService} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Nombre del Servicio</label>
                                    <div className="relative">
                                        <Type className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                        <input
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base"
                                            placeholder="Ej: Automatización de CRM"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Descripción</label>
                                    <div className="relative">
                                        <FileText className="absolute left-4 top-4 text-variable-muted" size={18} />
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all h-24 resize-none text-sm"
                                            placeholder="Describe brevemente en qué consiste el servicio..."
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Precio Base (€)</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.price}
                                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                                className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Disponibilidad</label>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                                            className={`w-full py-3 rounded-2xl font-bold text-sm transition-all border ${formData.is_active
                                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                                                : 'bg-rose-500/10 border-rose-500 text-rose-500'
                                                }`}
                                        >
                                            {formData.is_active ? 'Servicio Activo' : 'Servicio Inactivo'}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-4 flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Guardando...' : <><ShieldCheck size={20} /> Guardar Servicio</>}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
