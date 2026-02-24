import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Helper para cargar perfil
    const fetchProfile = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (!error && data) {
                console.log('[Auth] Profile loaded:', data.nombre, '| role:', data.role);
                return data;
            }
            console.error('[Auth] Profile error:', error?.message);
            return null;
        } catch (err) {
            console.error('[Auth] Profile exception:', err);
            return null;
        }
    };

    useEffect(() => {
        let mounted = true;
        let initialDone = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[Auth] Event:', event, '| User:', session?.user?.email ?? 'none');

                if (!mounted) return;

                if (session?.user) {
                    // IMPORTANTE: cargamos el perfil ANTES de actualizar el state
                    // para que ProtectedRoute nunca vea user sin profile
                    const profileData = await fetchProfile(session.user.id);

                    if (!mounted) return;

                    // Actualizamos todo de golpe
                    setUser(session.user);
                    setProfile(profileData);
                } else {
                    setUser(null);
                    setProfile(null);
                }

                // Marcamos el loading como terminado
                if (mounted) {
                    initialDone = true;
                    setLoading(false);
                }
            }
        );

        // Fallback: si onAuthStateChange no se dispara en 8 segundos, 
        // quitamos el loading de todas formas (previene spinner infinito)
        const fallbackTimer = setTimeout(() => {
            if (!initialDone && mounted) {
                console.warn('[Auth] Fallback: no auth event in 8s, forcing loading=false');
                setLoading(false);
            }
        }, 8000);

        return () => {
            mounted = false;
            clearTimeout(fallbackTimer);
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
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
