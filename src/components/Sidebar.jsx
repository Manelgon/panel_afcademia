import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Settings,
    LogOut,
    Target
} from 'lucide-react';
import logo from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';

const SidebarItem = ({ icon: Icon, to = "#", label, activeOverride, onClick }) => {
    const location = useLocation();

    let active = false;
    if (activeOverride !== undefined) {
        active = activeOverride;
    } else if (to !== "#") {
        active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    }

    if (onClick) {
        return (
            <button
                onClick={onClick}
                title={label}
                className={`p-3 md:p-4 rounded-2xl transition-all duration-300 flex items-center justify-center flex-shrink-0 ${active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-variable-muted hover:text-primary hover:bg-white/5'}`}
            >
                <Icon size={24} />
            </button>
        );
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

// Configuration submenu items
const CONFIG_ITEMS = [
    { icon: Users, to: '/users', label: 'Gestión de Equipo' },
];

export default function Sidebar() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [configOpen, setConfigOpen] = useState(false);
    const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
    const configRef = useRef(null);
    const mobileConfigRef = useRef(null);

    // Check if any config route is active
    const isConfigActive = CONFIG_ITEMS.some(item =>
        location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    );

    // Close desktop popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (configRef.current && !configRef.current.contains(e.target)) {
                setConfigOpen(false);
            }
            if (mobileConfigRef.current && !mobileConfigRef.current.contains(e.target)) {
                setMobileConfigOpen(false);
            }
        };
        if (configOpen || mobileConfigOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [configOpen, mobileConfigOpen]);

    const handleSignOut = async () => {
        try {
            await signOut();
            navigate('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const toggleConfig = () => setConfigOpen(prev => !prev);
    const toggleMobileConfig = () => setMobileConfigOpen(prev => !prev);

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
                    <SidebarItem icon={Target} to="/leads" label="Leads" />
                </div>

                <div className="mt-auto flex flex-col gap-4 items-center w-full px-4">
                    {/* Config toggle + floating popover */}
                    <div className="relative" ref={configRef}>
                        {/* Floating popover — appears to the right */}
                        <div className={`config-flyout ${configOpen ? 'config-flyout-open' : ''}`}>
                            <p className="config-flyout-title">CONFIGURACIÓN</p>
                            <div className="config-flyout-divider" />
                            {CONFIG_ITEMS.map((item) => (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    onClick={() => setConfigOpen(false)}
                                    className={`config-flyout-item ${location.pathname === item.to || location.pathname.startsWith(item.to + '/')
                                        ? 'config-flyout-item-active'
                                        : ''
                                        }`}
                                >
                                    <item.icon size={18} />
                                    <span>{item.label}</span>
                                </Link>
                            ))}
                        </div>

                        <button
                            onClick={toggleConfig}
                            title="Configuración"
                            className={`p-4 rounded-2xl transition-all duration-300 flex items-center justify-center ${isConfigActive || configOpen
                                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                : 'text-variable-muted hover:text-primary hover:bg-white/5'
                                }`}
                        >
                            <Settings size={24} className={`transition-transform duration-300 ${configOpen ? 'rotate-90' : ''}`} />
                        </button>
                    </div>

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
                    <SidebarItem icon={Target} to="/leads" label="Leads" />

                    {/* Mobile config with popover */}
                    <div className="relative" ref={mobileConfigRef}>
                        <div className={`config-popover-mobile ${mobileConfigOpen ? 'config-popover-open' : ''}`}>
                            <p className="config-flyout-title" style={{ fontSize: '9px' }}>CONFIGURACIÓN</p>
                            <div className="config-flyout-divider" />
                            {CONFIG_ITEMS.map((item) => (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    onClick={() => setMobileConfigOpen(false)}
                                    className={`config-popover-item ${location.pathname === item.to || location.pathname.startsWith(item.to + '/')
                                        ? 'config-flyout-item-active'
                                        : ''
                                        }`}
                                >
                                    <item.icon size={18} />
                                    <span>{item.label}</span>
                                </Link>
                            ))}
                        </div>

                        <button
                            onClick={toggleMobileConfig}
                            title="Configuración"
                            className={`p-3 rounded-xl transition-all flex-shrink-0 flex items-center justify-center ${isConfigActive || mobileConfigOpen
                                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                : 'text-variable-muted hover:text-primary hover:bg-white/5'
                                }`}
                        >
                            <Settings size={22} />
                        </button>
                    </div>

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
