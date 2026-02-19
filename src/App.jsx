import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Users from './pages/Users';
import Leads from './pages/Leads';
import Services from './pages/Services';
import Login from './pages/Login';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Componente para proteger rutas
const ProtectedRoute = ({ children, requireAdmin = true }) => {
    const { user, profile, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0F0716]">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" />;
    }

    // Modificado para ser permisivo: Solo bloquea si hay perfil y NO es admin
    if (requireAdmin && profile && profile.role !== 'admin') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0F0716] text-white p-10 text-center font-display">
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

                        <Route path="/services" element={
                            <ProtectedRoute>
                                <Services />
                            </ProtectedRoute>
                        } />

                        <Route path="/projects/:id" element={
                            <ProtectedRoute>
                                <ProjectDetail />
                            </ProtectedRoute>
                        } />

                        <Route path="/projects" element={
                            <ProtectedRoute>
                                <ProjectDetail />
                            </ProtectedRoute>
                        } />

                        {/* Redirect a login por defecto si no encuentra ruta */}
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </Router>
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;
