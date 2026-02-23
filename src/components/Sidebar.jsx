import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom'; // Added useNavigate
import {
    LayoutDashboard,
    Users,
    FolderOpen,
    FileText,
    Settings,
    LogOut,
    Target,
    Briefcase,
    ListTodo,
    Calendar as CalendarIcon
} from 'lucide-react';
import logo from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';

const SidebarItem = ({ icon: Icon, to = "#", label, activeOverride }) => {
    const location = useLocation();
    // Simple logic: if to is provided and not #, check if path matches
    // But exact match for '/'? current logic in Dashboard was manual active.
    // Let's rely on location.pathname matching 'to'.
    // Exception: for '/', exact match needed, otherwise true for all paths starting with /

    let active = false;
    if (activeOverride !== undefined) {
        active = activeOverride;
    } else if (to !== "#") {
        active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    }

    return (
        <Link
            to={to}
            title={label}
            className={`p-3 md:p-4 rounded-2xl transition-all duration-300 flex items-center justify-center flex-shrink-0 ${active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-variable-muted hover:text-primary hover:bg-white/5'}`}
        >
            <Icon size={24} />
        </Link>
    );
};

export default function Sidebar() {
    const { signOut } = useAuth();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        try {
            await signOut();
            navigate('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-28 flex-col items-center py-8 glass border-r border-variable h-screen sticky top-0 shrink-0 z-50">
                <div className="mb-12">
                    <div className="size-14 rounded-2xl bg-white/5 flex items-center justify-center p-2 shadow-xl border border-variable">
                        <img src={logo} alt="AFCademia" className="w-full h-full object-contain" />
                    </div>
                </div>

                <div className="flex flex-col gap-6 flex-1 w-full px-4 items-center">
                    <SidebarItem icon={LayoutDashboard} to="/" label="Dashboard" />
                    <SidebarItem icon={Users} to="/users" label="Usuarios" />
                    <SidebarItem icon={Target} to="/leads" label="Leads" />
                </div>

                <div className="mt-auto flex flex-col gap-6 items-center w-full px-4">
                    <SidebarItem icon={Settings} label="Configuración" />

                    <button
                        onClick={handleSignOut}
                        className="p-4 rounded-2xl text-variable-muted hover:text-red-600 hover:bg-red-500/10 transition-all duration-300 flex items-center justify-center"
                        title="Cerrar Sesión"
                    >
                        <LogOut size={24} />
                    </button>

                    <div className="size-12 rounded-2xl border-2 border-primary/20 p-0.5 mt-2">
                        <img className="rounded-xl w-full h-full object-cover" src="https://ui-avatars.com/api/?name=AF&background=003865&color=fff" alt="User" />
                    </div>
                </div>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-variable z-[100] safe-area-bottom">
                <div className="flex items-center justify-around px-3 py-2">
                    <SidebarItem icon={LayoutDashboard} to="/" label="Dashboard" />
                    <SidebarItem icon={Users} to="/users" label="Usuarios" />
                    <SidebarItem icon={Target} to="/leads" label="Leads" />
                    <SidebarItem icon={Settings} label="Config" />
                    <button
                        onClick={handleSignOut}
                        className="p-3 rounded-xl text-variable-muted hover:text-red-600 hover:bg-red-500/10 transition-all flex-shrink-0 flex items-center justify-center"
                        title="Cerrar Sesión"
                    >
                        <LogOut size={22} />
                    </button>
                </div>
            </nav>
        </>
    );
}
