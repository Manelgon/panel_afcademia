import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    // Empieza en TRUE: estamos esperando que Supabase confirme la sesión
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // onAuthStateChange es la ÚNICA fuente de verdad.
        // Supabase lo dispara automáticamente al iniciar con:
        //   - INITIAL_SESSION (sin sesión guardada) → session = null
        //   - SIGNED_IN (con sesión guardada en localStorage) → session = {...}
        // Esto reemplaza la necesidad de llamar a getSession() manualmente.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[Auth] Event:', event, '| User:', session?.user?.email ?? 'none');

                if (session?.user) {
                    setUser(session.user);

                    // Cargamos el perfil en background (sin bloquear el loading)
                    try {
                        const { data, error } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', session.user.id)
                            .single();

                        if (!error && data) {
                            setProfile(data);
                        } else if (error) {
                            console.error('[Auth] Profile fetch error:', error.message);
                        }
                    } catch (err) {
                        console.error('[Auth] Profile fetch exception:', err);
                    }
                } else {
                    // Sin sesión: limpiamos el estado
                    setUser(null);
                    setProfile(null);
                }

                // En cualquier caso, terminamos el estado de carga inicial
                setLoading(false);
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        // El listener de arriba (onAuthStateChange con SIGNED_OUT) limpiará el estado
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return context;
};
