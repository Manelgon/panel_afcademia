import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const profileFetchedFor = useRef(null);

    // ===================================================================
    // EFECTO 1: Auth listener — SOLO state updates síncronos
    // NUNCA hacer queries de Supabase dentro de onAuthStateChange
    // porque causa deadlocks con getSession() y otras queries.
    // ===================================================================
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                console.log('[Auth] Event:', event, '| User:', session?.user?.email ?? 'none');

                // SOLO operaciones síncronas aquí
                if (session?.user) {
                    setUser(session.user);
                } else {
                    setUser(null);
                    setProfile(null);
                    profileFetchedFor.current = null;
                }
                setLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // ===================================================================
    // EFECTO 2: Cargar perfil FUERA del callback de auth
    // Se activa cuando cambia el user, con un pequeño delay para
    // asegurar que el cliente Supabase completó su inicialización.
    // ===================================================================
    useEffect(() => {
        if (!user) {
            setProfile(null);
            profileFetchedFor.current = null;
            return;
        }

        // Evitar fetch duplicado para el mismo user
        if (profileFetchedFor.current === user.id) return;
        profileFetchedFor.current = user.id;

        const fetchProfile = async () => {
            try {
                console.log('[Auth] Fetching profile for:', user.email);
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (!error && data) {
                    console.log('[Auth] Profile loaded:', data.nombre, '| role:', data.role);
                    setProfile(data);
                } else if (error) {
                    console.error('[Auth] Profile error:', error.message);
                }
            } catch (err) {
                console.error('[Auth] Profile exception:', err);
            }
        };

        // Defer: ejecutar fuera del ciclo de auth del cliente
        const timer = setTimeout(fetchProfile, 50);
        return () => clearTimeout(timer);
    }, [user]);

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
