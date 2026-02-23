import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);
    const initializationStarted = useRef(false);

    const fetchProfile = useCallback(async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (!error && data) {
                setProfile(data);
                return data;
            }
            if (error) console.error("Error fetching profile:", error.message);
        } catch (err) {
            console.error("fetchProfile exception:", err);
        }
        return null;
    }, []);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            if (initializationStarted.current) return;
            initializationStarted.current = true;

            try {
                // Paso 1: Obtener sesión de forma explícita
                console.log("AuthProvider: Initializing session check...");
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) throw sessionError;

                if (mounted) {
                    setUser(session?.user ?? null);
                    console.log("AuthProvider: Session user:", session?.user?.email || 'none');

                    if (session?.user) {
                        setProfileLoading(true);
                        try {
                            // Intentamos cargar el perfil con un timeout razonable
                            await Promise.race([
                                fetchProfile(session.user.id),
                                new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error('Profile fetch timeout')), 15000)
                                )
                            ]);
                        } catch (err) {
                            console.warn("Initial profile fetch issue:", err.message);
                        } finally {
                            if (mounted) setProfileLoading(false);
                        }
                    }
                }
            } catch (err) {
                console.error("Auth initialization failed:", err.message);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        initializeAuth();

        // Suscripción a cambios (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;

            console.log("Auth Event Triggered:", event);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                setUser(session?.user ?? null);
                if (session?.user) {
                    setProfileLoading(true);
                    await fetchProfile(session.user.id);
                    setProfileLoading(false);
                }
                setLoading(false);
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                setProfile(null);
                setLoading(false);
            } else if (event === 'INITIAL_SESSION' && !session) {
                // Si llegamos aquí y ya terminó el initAuth, aseguramos el loading en false
                setLoading(false);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error("SignOut error:", err);
        } finally {
            setUser(null);
            setProfile(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, profileLoading, signOut }}>
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
