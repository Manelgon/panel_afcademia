import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);

    useEffect(() => {
        const getSession = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session check timeout')), 5000)
                );

                const result = await Promise.race([sessionPromise, timeoutPromise]);
                const { data: { session }, error } = result;

                if (error) {
                    setLoading(false);
                    return;
                }

                setUser(session?.user ?? null);

                if (session?.user) {
                    setProfileLoading(true);
                    try {
                        await Promise.race([
                            fetchProfile(session.user.id),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
                            )
                        ]);
                    } catch (_) {
                        // Profile fetch timed out, continue
                    } finally {
                        setProfileLoading(false);
                    }
                }
            } catch (_) {
                setUser(null);
                setProfile(null);
            } finally {
                setLoading(false);
            }
        };

        getSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                setProfileLoading(true);
                try {
                    await fetchProfile(session.user.id);
                } catch (_) {
                    // Profile fetch failed
                } finally {
                    setProfileLoading(false);
                }
            } else {
                setProfile(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (!error && data) {
            setProfile(data);
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
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
