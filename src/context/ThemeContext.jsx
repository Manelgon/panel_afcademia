import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Check localStorage or default to dark (true)
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('theme-mode');
        return saved === null ? true : saved === 'dark';
    });

    useEffect(() => {
        if (!darkMode) {
            document.documentElement.classList.add('light');
            localStorage.setItem('theme-mode', 'light');
        } else {
            document.documentElement.classList.remove('light');
            localStorage.setItem('theme-mode', 'dark');
        }
    }, [darkMode]);

    const toggleTheme = () => setDarkMode(!darkMode);

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
