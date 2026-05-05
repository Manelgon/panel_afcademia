import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const NotificationContext = createContext(null);

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [confirmState, setConfirmState] = useState(null);

    const showNotification = useCallback((message, type = 'success') => {
        const id = Math.random().toString(36).substr(2, 9);
        setNotifications(prev => [...prev, { id, message, type }]);

        // Auto remove after 5 seconds
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    }, []);

    const confirm = useCallback((data) => {
        return new Promise((resolve) => {
            setConfirmState({
                ...data,
                resolve: (value) => {
                    setConfirmState(null);
                    resolve(value);
                }
            });
        });
    }, []);

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return (
        <NotificationContext.Provider value={{ showNotification, confirm }}>
            {children}

            {/* Notifications Container */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {notifications.map((notification) => (
                        <motion.div
                            key={notification.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className="pointer-events-auto"
                        >
                            <div className={`relative overflow-hidden glass rounded-2xl p-4 shadow-2xl border flex items-center gap-4 ${notification.type === 'error'
                                ? 'border-rose-500/30'
                                : notification.type === 'warning'
                                    ? 'border-amber-500/30'
                                    : 'border-primary/30'
                                }`}>
                                {/* Background Glow */}
                                <div className={`absolute -right-10 -top-10 size-32 blur-3xl rounded-full opacity-10 ${notification.type === 'error' ? 'bg-rose-500' : 'bg-primary'
                                    }`} />

                                <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${notification.type === 'error'
                                    ? 'bg-rose-500/20 text-rose-500'
                                    : 'bg-primary/20 text-primary'
                                    }`}>
                                    {notification.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                                </div>

                                <div className="flex-1">
                                    <p className="text-sm font-bold text-variable-main">
                                        {notification.type === 'error' ? 'Error' : 'Éxito'}
                                    </p>
                                    <p className="text-xs text-variable-muted leading-relaxed">
                                        {notification.message}
                                    </p>
                                </div>

                                <button
                                    onClick={() => removeNotification(notification.id)}
                                    className="p-1.5 hover:bg-white/5 rounded-lg text-variable-muted transition-colors"
                                >
                                    <X size={16} />
                                </button>

                                {/* Progress Bar */}
                                <motion.div
                                    initial={{ scaleX: 1 }}
                                    animate={{ scaleX: 0 }}
                                    transition={{ duration: 5, ease: "linear" }}
                                    className={`absolute bottom-0 left-0 right-0 h-0.5 origin-left ${notification.type === 'error' ? 'bg-rose-500' : 'bg-primary'
                                        }`}
                                />
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {confirmState && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => confirmState.resolve(confirmState.secondaryText ? 'cancel' : false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-md glass rounded-[2.5rem] p-8 sm:p-10 shadow-2xl text-center"
                        >
                            <div className="size-16 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mx-auto mb-6">
                                <AlertCircle size={32} />
                            </div>
                            <h2 className="text-2xl font-bold text-variable-main mb-2">
                                {confirmState.title || '¿Estás seguro?'}
                            </h2>
                            <p className="text-variable-muted text-sm sm:text-base mb-8 leading-relaxed">
                                {confirmState.message}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => confirmState.resolve(confirmState.secondaryText ? 'cancel' : false)}
                                    className="flex-1 py-4 glass rounded-2xl font-bold text-variable-main hover:bg-white/5 transition-all"
                                >
                                    {confirmState.cancelText || 'Cancelar'}
                                </button>
                                {confirmState.secondaryText && (
                                    <button
                                        onClick={() => confirmState.resolve('secondary')}
                                        className="flex-1 py-4 glass border border-variable rounded-2xl font-bold text-variable-main hover:bg-white/5 transition-all"
                                    >
                                        {confirmState.secondaryText}
                                    </button>
                                )}
                                <button
                                    onClick={() => confirmState.resolve(true)}
                                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 shadow-xl shadow-primary/20 transition-all"
                                >
                                    {confirmState.confirmText || 'Confirmar'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </NotificationContext.Provider>
    );
};
