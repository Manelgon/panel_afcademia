import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active sessions and sets the user
        const getSession = async () => {
            try {
                // Add a timeout to getSession to prevent hanging indefinitely
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timeout')), 30000));

                const result = await Promise.race([sessionPromise, timeoutPromise]);
                const { data: { session }, error } = result;

                if (error) {
                    console.error("Error getting session:", error);
                    return;
                }

                setUser(session?.user ?? null);

                if (session?.user) {
                    // Don't let profile fetch block the whole app loading forever
                    try {
                        await Promise.race([
                            fetchProfile(session.user.id),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 15000))
                        ]);
                    } catch (profileErr) {
                        console.warn("Could not fetch profile in time, continuing without profile:", profileErr);
                    }
                }
            } catch (err) {
                console.error("Session restoration failed:", err);
                // If session check fails completely, we might want to sign out or just let it be null
            } finally {
                setLoading(false);
            }
        };

        getSession();

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                await fetchProfile(session.user.id);
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
