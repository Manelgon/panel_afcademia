import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const UnsavedChangesContext = createContext({
    isDirty: false,
    setDirty: () => { },
    requestNavigate: () => { }
});

export function UnsavedChangesProvider({ children }) {
    const [isDirty, setIsDirty] = useState(false);
    const [pendingTo, setPendingTo] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Aviso nativo al cerrar pestaña / recargar
    useEffect(() => {
        const handler = (e) => {
            if (!isDirty) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // Cambio de ruta limpia el dirty automáticamente (al entrar a una página nueva)
    useEffect(() => {
        setIsDirty(false);
    }, [location.pathname]);

    const requestNavigate = useCallback((to) => {
        if (!isDirty || to === location.pathname) {
            navigate(to);
            return;
        }
        setPendingTo(to);
    }, [isDirty, location.pathname, navigate]);

    const confirmLeave = () => {
        const to = pendingTo;
        setPendingTo(null);
        setIsDirty(false);
        if (to) navigate(to);
    };

    const cancelLeave = () => setPendingTo(null);

    return (
        <UnsavedChangesContext.Provider value={{ isDirty, setDirty: setIsDirty, requestNavigate }}>
            {children}
            {pendingTo && <UnsavedChangesModal onConfirm={confirmLeave} onCancel={cancelLeave} />}
        </UnsavedChangesContext.Provider>
    );
}

export const useUnsavedChanges = () => useContext(UnsavedChangesContext);

function UnsavedChangesModal({ onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass rounded-3xl p-8 max-w-md w-full border border-variable shadow-2xl">
                <div className="size-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                    <AlertTriangle size={28} />
                </div>
                <h2 className="text-xl font-bold text-variable-main mb-2">¿Salir sin guardar?</h2>
                <p className="text-variable-muted text-sm mb-6">
                    Tienes cambios sin guardar. Si sales ahora se perderán.
                </p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-2xl border border-variable text-variable-main hover:bg-white/5 transition font-semibold"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-5 py-2.5 rounded-2xl bg-red-500 text-white hover:brightness-110 transition font-semibold"
                    >
                        Salir sin guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
