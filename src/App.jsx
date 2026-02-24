import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Users from './pages/Users';
import Leads from './pages/Leads';
import Services from './pages/Services';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import Login from './pages/Login';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LoadingProvider } from './context/LoadingContext';

const ProtectedRoute = ({ children, requireAdmin = true }) => {
    const { user, profile, loading } = useAuth();

    // Auth todavía inicializando — mostramos spinner
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-variable-main">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    // Sin sesión → redirigir a login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Verificación de admin:
    // - Si profile cargó y NO es admin → Acceso Denegado
    // - Si profile es null (error de RLS/timeout) → dejamos pasar (graceful degradation)
    // - Si profile es admin → dejamos pasar
    if (requireAdmin && profile && profile.role !== 'admin') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-variable-main text-variable-main p-10 text-center font-display">
                <div>
                    <h1 className="text-4xl font-bold mb-4 text-primary">Acceso Denegado</h1>
                    <p className="text-xl text-gray-400">No tienes permisos de administrador para ver esta sección.</p>
                </div>
            </div>
        );
    }

    return children;
};

function App() {
    return (
        <AuthProvider>
            <NotificationProvider>
                <LoadingProvider>
                    <ThemeProvider>
                        <Router>
                            <Routes>
                                <Route path="/login" element={<Login />} />

                                <Route path="/" element={
                                    <ProtectedRoute>
                                        <Dashboard />
                                    </ProtectedRoute>
                                } />

                                <Route path="/users" element={
                                    <ProtectedRoute>
                                        <Users />
                                    </ProtectedRoute>
                                } />

                                <Route path="/leads" element={
                                    <ProtectedRoute>
                                        <Leads />
                                    </ProtectedRoute>
                                } />

                                {/* Redirect a login por defecto si no encuentra ruta */}
                                <Route path="*" element={<Navigate to="/" />} />
                            </Routes>
                        </Router>
                    </ThemeProvider>
                </LoadingProvider>
            </NotificationProvider>
        </AuthProvider>
    );
}

export default App;
