import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const getSession = async () => {
            try {
                // Short timeout (5s) - if Supabase doesn't respond quickly, go to login
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session check timeout')), 5000)
                );

                const result = await Promise.race([sessionPromise, timeoutPromise]);
                const { data: { session }, error } = result;

                if (error) {
                    console.error("Error getting session:", error);
                    setLoading(false);
                    return;
                }

                setUser(session?.user ?? null);

                if (session?.user) {
                    // Profile fetch with short timeout - don't block the UI
                    try {
                        await Promise.race([
                            fetchProfile(session.user.id),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
                            )
                        ]);
                    } catch (profileErr) {
                        console.warn("Profile fetch timeout, continuing without profile:", profileErr.message);
                    }
                }
            } catch (err) {
                console.warn("Session check timed out or failed:", err.message);
                // On timeout, just proceed to login - don't hang
                setUser(null);
                setProfile(null);
            } finally {
                setLoading(false);
            }
        };

        getSession();

        // Listen for auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                // Fire and forget - don't await indefinitely
                fetchProfile(session.user.id).catch(err =>
                    console.warn("Profile fetch failed on auth change:", err.message)
                );
            } else {
                setProfile(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (!error && data) {
            setProfile(data);
        } else if (error) {
            console.warn("Error fetching profile:", error.message);
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
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
