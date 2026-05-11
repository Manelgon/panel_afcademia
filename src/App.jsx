import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LoadingProvider } from './context/LoadingContext';
import { UnsavedChangesProvider } from './context/UnsavedChangesContext';

// Lazy-load: cada pagina entra a su propio chunk.
// Reduce el bundle inicial de ~1.1 MB a ~250 KB y mejora First Paint.
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Users = lazy(() => import('./pages/Users'));
const Leads = lazy(() => import('./pages/Leads'));
const Clientes = lazy(() => import('./pages/Clientes'));
const ClienteDetail = lazy(() => import('./pages/ClienteDetail'));
const Fundae = lazy(() => import('./pages/Fundae'));
const AjustesEmisor = lazy(() => import('./pages/AjustesEmisor'));
// NOTA: Projects, ProjectDetail, Tasks, Calendar existen como paginas pero
// no estan registradas como rutas todavia (mantener paridad con original).
const FundaePublicForm = lazy(() => import('./pages/FundaePublicForm'));
const FundaeAlumnosPublic = lazy(() => import('./pages/FundaeAlumnosPublic'));
const Alumnos = lazy(() => import('./pages/Alumnos'));
const AlumnoDetail = lazy(() => import('./pages/AlumnoDetail'));
const Cursos = lazy(() => import('./pages/Cursos'));
const CursoDetail = lazy(() => import('./pages/CursoDetail'));
const Facturacion = lazy(() => import('./pages/Facturacion'));

const RouteSpinner = () => (
    <div className="min-h-screen flex items-center justify-center bg-variable-main">
        <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
);

const ProtectedRoute = ({ children, requireAdmin = true }) => {
    const { user, profile, loading } = useAuth();

    if (loading) {
        return <RouteSpinner />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Si profile cargo y NO es admin -> Acceso Denegado.
    // Si profile es null (RLS/timeout) dejamos pasar (graceful degradation).
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
                            <UnsavedChangesProvider>
                                <Suspense fallback={<RouteSpinner />}>
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

                                    <Route path="/clientes" element={
                                        <ProtectedRoute>
                                            <Clientes />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/clientes/:id" element={
                                        <ProtectedRoute>
                                            <ClienteDetail />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/fundae" element={
                                        <ProtectedRoute>
                                            <Fundae />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/ajustes-emisor" element={
                                        <ProtectedRoute>
                                            <AjustesEmisor />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/fundae-form/:token" element={<FundaePublicForm />} />
                                    <Route path="/fundae-alumnos/:token" element={<FundaeAlumnosPublic />} />

                                    <Route path="/alumnos" element={
                                        <ProtectedRoute>
                                            <Alumnos />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/alumnos/:id" element={
                                        <ProtectedRoute>
                                            <AlumnoDetail />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/cursos" element={
                                        <ProtectedRoute>
                                            <Cursos />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/cursos/:courseid" element={
                                        <ProtectedRoute>
                                            <CursoDetail />
                                        </ProtectedRoute>
                                    } />

                                    <Route path="/facturacion" element={
                                        <ProtectedRoute>
                                            <Facturacion />
                                        </ProtectedRoute>
                                    } />

                                    {/* Redirect a / si no encuentra ruta (luego ProtectedRoute mandara a /login si no hay sesion) */}
                                    <Route path="*" element={<Navigate to="/" />} />
                                </Routes>
                                </Suspense>
                            </UnsavedChangesProvider>
                        </Router>
                    </ThemeProvider>
                </LoadingProvider>
            </NotificationProvider>
        </AuthProvider>
    );
}

export default App;
