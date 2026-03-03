import React, { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Always light mode — dark mode removed
    const darkMode = false;
    const toggleTheme = () => { }; // No-op

    useEffect(() => {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme-mode', 'light');
    }, []);

    return (
        <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme debe usarse dentro de un ThemeProvider');
    }
    return context;
};
