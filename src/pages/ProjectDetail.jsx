import React, { useState, useEffect } from 'react';
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Clock,
    Download,
    FileText,
    Share2,
    Edit3,
    BarChart3,
    MoreVertical,
    LayoutDashboard,
    Users as UsersIcon,
    FolderOpen,
    Settings,
    Sun,
    Moon,
    Plus,
    X,
    ShieldCheck,
    Briefcase,
    Target,
    Trash2,
    Receipt,
    ChevronDown,
    ChevronUp,
    DollarSign,
    Percent,
    CreditCard,
    Banknote,
    Building2,
    Smartphone,
    Wallet,
    TrendingDown,
    TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();
    const { profile: currentProfile } = useAuth();
    const { showNotification } = useNotifications();

    const [project, setProject] = useState(null);
    const [milestones, setMilestones] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modals state
    const [milestoneModal, setMilestoneModal] = useState(false);
    const [taskModal, setTaskModal] = useState(false);

    // State for creating items
    const [newMilestone, setNewMilestone] = useState({ title: '', target_date: '', status: 'pending' });
    const [newTask, setNewTask] = useState({ title: '', priority: 'Media', assigned_to: '' });
    const [users, setUsers] = useState([]);
    const [formLoading, setFormLoading] = useState(false);

    // Budget / Services state
    const [projectServices, setProjectServices] = useState([]);
    const [budgetLines, setBudgetLines] = useState([]);
    const [budgetExpanded, setBudgetExpanded] = useState(true);
    const [budgetLineModal, setBudgetLineModal] = useState(false);
    const [newBudgetLine, setNewBudgetLine] = useState({ description: '', unit_price: '', quantity: 1, iva_percent: 21 });
    const [invoices, setInvoices] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [invoiceLoading, setInvoiceLoading] = useState(false);

    // Payments state
    const [payments, setPayments] = useState([]);
    const [paymentModal, setPaymentModal] = useState(false);
    const [newPayment, setNewPayment] = useState({ amount: '', payment_method: 'transferencia', notes: '' });
    const [paymentsExpanded, setPaymentsExpanded] = useState(true);
    const [editingLineId, setEditingLineId] = useState(null);
    const [tempLine, setTempLine] = useState(null);

    const fetchProjectData = async () => {
        try {
            setLoading(true);

            // Fetch project
            const { data: proj, error: projErr } = await supabase
                .from('projects')
                .select('*, leads(*)')
                .eq('id', id)
                .single();
            if (projErr) throw projErr;
            setProject(proj);

            // Fetch milestones
            const { data: miles, error: milesErr } = await supabase
                .from('project_milestones')
                .select('*')
                .eq('project_id', id)
                .order('target_date', { ascending: true });
            if (milesErr) throw milesErr;
            setMilestones(miles);

            // Fetch tasks (Top priority 10)
            const { data: tks, error: tksErr } = await supabase
                .from('project_tasks')
                .select('*')
                .eq('project_id', id)
                .order('created_at', { ascending: false });
            if (tksErr) throw tksErr;
            setTasks(tks);

            // Fetch files
            const { data: fls, error: flsErr } = await supabase
                .from('project_files')
                .select('*')
                .eq('project_id', id)
                .order('created_at', { ascending: false });
            if (flsErr) throw flsErr;
            setFiles(fls);

        } catch (error) {
            console.error('Error fetching project detail:', error);
            // navigate('/projects');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        const { data } = await supabase.from('users').select('id, first_name, second_name').order('first_name');
        setUsers(data || []);
    };

    const fetchBudgetData = async () => {
        // Fetch services linked to this project
        const { data: svcData } = await supabase
            .from('project_services')
            .select('*, services:service_id(name, description, price)')
            .eq('project_id', id);
        setProjectServices(svcData || []);

        // Fetch manual budget lines
        const { data: lineData } = await supabase
            .from('project_budget_lines')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: true });
        setBudgetLines(lineData || []);

        // Fetch invoices
        const { data: invData } = await supabase
            .from('project_invoices')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: false });
        setInvoices(invData || []);

        // Fetch budgets
        const { data: budData } = await supabase
            .from('project_budgets')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: false });
        setBudgets(budData || []);

        // Fetch payments
        const { data: payData } = await supabase
            .from('project_payments')
            .select('*, created_by_user:created_by(first_name, second_name)')
            .eq('project_id', id)
            .order('payment_date', { ascending: false });
        setPayments(payData || []);
    };

    useEffect(() => {
        if (id) {
            fetchProjectData();
            fetchUsers();
            fetchBudgetData();

            // Subscriptions
            const channel = supabase.channel(`project-${id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_milestones', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_files', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_services', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_budget_lines', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_invoices', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_budgets', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'project_payments', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .subscribe();

            return () => { supabase.removeChannel(channel); };
        }
    }, [id]);

    const handleAddMilestone = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const { error } = await supabase
                .from('project_milestones')
                .insert([{ ...newMilestone, project_id: id }]);
            if (error) throw error;
            setMilestoneModal(false);
            setNewMilestone({ title: '', target_date: '', status: 'pending' });
            showNotification('Hito añadido correctamente');
            fetchProjectData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setFormLoading(false);
        }
    };

    const handleAddTask = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const { error } = await supabase
                .from('project_tasks')
                .insert([{ ...newTask, project_id: id }]);
            if (error) throw error;
            setTaskModal(false);
            setNewTask({ title: '', priority: 'Media', assigned_to: '' });
            showNotification('Tarea creada correctamente');
            fetchProjectData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setFormLoading(false);
        }
    };

    const handleAddBudgetLine = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const { error } = await supabase
                .from('project_budget_lines')
                .insert([{
                    project_id: id,
                    description: newBudgetLine.description,
                    unit_price: parseFloat(newBudgetLine.unit_price) || 0,
                    quantity: parseInt(newBudgetLine.quantity) || 1,
                    iva_percent: parseFloat(newBudgetLine.iva_percent) || 21
                }]);
            if (error) throw error;
            setBudgetLineModal(false);
            setNewBudgetLine({ description: '', unit_price: '', quantity: 1, iva_percent: 21 });
            showNotification('Línea de presupuesto añadida');
            fetchBudgetData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeleteBudgetLine = async (lineId) => {
        const { error } = await supabase.from('project_budget_lines').delete().eq('id', lineId);
        if (error) showNotification(`Error: ${error.message}`, 'error');
        else fetchBudgetData();
    };

    const handleRemoveProjectService = async (psId) => {
        const { error } = await supabase.from('project_services').delete().eq('id', psId);
        if (error) showNotification(`Error: ${error.message}`, 'error');
        else fetchBudgetData();
    };

    const handleSaveLine = async (id, isService) => {
        try {
            const table = isService ? 'project_services' : 'project_budget_lines';
            const { error } = await supabase
                .from(table)
                .update({
                    unit_price: parseFloat(tempLine.unit_price) || 0,
                    quantity: parseInt(tempLine.quantity) || 1,
                    iva_percent: parseFloat(tempLine.iva_percent) || 0
                })
                .eq('id', id);

            if (error) throw error;
            showNotification('Línea actualizada');
            setEditingLineId(null);
            setTempLine(null);
            fetchBudgetData();
        } catch (error) {
            showNotification(`Error al guardar: ${error.message}`, 'error');
        }
    };

    const handleEditLine = (line) => {
        if (line.invoiced) {
            showNotification('No se puede editar una línea ya facturada', 'error');
            return;
        }
        setEditingLineId(line.id);
        setTempLine({
            unit_price: line.unit_price,
            quantity: line.quantity,
            iva_percent: line.iva_percent
        });
    };

    // Cálculos de presupuesto — separar facturadas vs pendientes
    const serviceLines = projectServices.map(ps => {
        const unitPrice = parseFloat(ps.unit_price !== null ? ps.unit_price : ps.services?.price) || 0;
        const quantity = parseInt(ps.quantity) || 1;
        const ivaPercent = parseFloat(ps.iva_percent) || 21;
        const base = unitPrice * quantity;
        const iva = base * (ivaPercent / 100);
        return {
            description: ps.services?.name || 'Servicio',
            base,
            iva,
            total: base + iva,
            isService: true,
            id: ps.id,
            invoiced: !!ps.invoice_id,
            quantity,
            unit_price: unitPrice,
            iva_percent: ivaPercent
        };
    });
    const manualLines = budgetLines.map(bl => {
        const base = (parseFloat(bl.unit_price) || 0) * (parseInt(bl.quantity) || 1);
        const iva = base * ((parseFloat(bl.iva_percent) || 0) / 100);
        return {
            description: bl.description,
            base,
            iva,
            total: base + iva,
            isService: false,
            id: bl.id,
            quantity: bl.quantity,
            unit_price: bl.unit_price,
            iva_percent: bl.iva_percent,
            invoiced: !!bl.invoice_id
        };
    });
    const allBudgetLines = [...serviceLines, ...manualLines];
    const uninvoicedLines = allBudgetLines.filter(l => !l.invoiced);
    const invoicedLines = allBudgetLines.filter(l => l.invoiced);
    const budgetSubtotal = allBudgetLines.reduce((sum, l) => sum + l.base, 0);
    const budgetIVA = allBudgetLines.reduce((sum, l) => sum + l.iva, 0);
    const budgetTotal = allBudgetLines.reduce((sum, l) => sum + l.total, 0);
    const uninvoicedSubtotal = uninvoicedLines.reduce((sum, l) => sum + l.base, 0);
    const uninvoicedIVA = uninvoicedLines.reduce((sum, l) => sum + l.iva, 0);
    const uninvoicedTotal = uninvoicedLines.reduce((sum, l) => sum + l.total, 0);

    // Generar PDF de factura
    const generateInvoicePDF = (invoiceData) => {
        const doc = new jsPDF();
        const pName = invoiceData.projectName || project?.name || 'Proyecto';
        const pAlias = invoiceData.projectAlias || project?.id_alias || '';
        const pClient = invoiceData.clientName || project?.client || 'Cliente';

        // Header
        doc.setFillColor(30, 30, 40);
        doc.rect(0, 0, 220, 42, 'F');
        doc.setTextColor(255, 140, 50);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('FACTURA', 15, 22);
        doc.setFontSize(10);
        doc.setTextColor(180, 180, 190);
        doc.text(`N.º ${invoiceData.invoice_number}`, 15, 32);
        doc.text(`Fecha: ${new Date(invoiceData.invoice_date).toLocaleDateString('es-ES')}`, 15, 38);

        // Company info (right side)
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Automatízatelo', 195, 18, { align: 'right' });
        doc.setFontSize(8);
        doc.setTextColor(180, 180, 190);
        doc.text('automatizatelo.com', 195, 25, { align: 'right' });

        // Project / Client info
        doc.setTextColor(60, 60, 70);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PROYECTO:', 15, 55);
        doc.setFont('helvetica', 'normal');
        doc.text(`${pName}${pAlias ? ` (${pAlias})` : ''}`, 50, 55);
        doc.setFont('helvetica', 'bold');
        doc.text('CLIENTE:', 15, 62);
        doc.setFont('helvetica', 'normal');
        doc.text(pClient, 50, 62);

        // Table
        const lines = invoiceData.line_items || [];
        const tableRows = lines.map(l => [
            l.description,
            l.quantity?.toString() || '1',
            `€${parseFloat(l.unit_price || 0).toFixed(2)}`,
            `${l.iva_percent || 21}%`,
            `€${parseFloat(l.base || 0).toFixed(2)}`,
            `€${parseFloat(l.total || 0).toFixed(2)}`
        ]);

        doc.autoTable({
            startY: 72,
            head: [['Concepto', 'Cant.', 'Precio Unit.', 'IVA', 'Base', 'Total']],
            body: tableRows,
            headStyles: { fillColor: [255, 140, 50], textColor: 255, fontSize: 9, fontStyle: 'bold' },
            bodyStyles: { fontSize: 9, textColor: [50, 50, 60] },
            alternateRowStyles: { fillColor: [245, 245, 248] },
            columnStyles: {
                0: { cellWidth: 60 },
                1: { halign: 'center', cellWidth: 18 },
                2: { halign: 'right', cellWidth: 28 },
                3: { halign: 'center', cellWidth: 18 },
                4: { halign: 'right', cellWidth: 28 },
                5: { halign: 'right', cellWidth: 28 },
            },
            margin: { left: 15, right: 15 },
        });

        const finalY = doc.lastAutoTable.finalY + 10;

        // Totals
        doc.setDrawColor(200, 200, 210);
        doc.line(120, finalY, 195, finalY);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 90);
        doc.text('Subtotal (Base Imponible):', 120, finalY + 8);
        doc.text(`€${parseFloat(invoiceData.subtotal).toFixed(2)}`, 195, finalY + 8, { align: 'right' });
        doc.text('IVA Total:', 120, finalY + 16);
        doc.text(`€${parseFloat(invoiceData.iva_total).toFixed(2)}`, 195, finalY + 16, { align: 'right' });

        doc.setDrawColor(255, 140, 50);
        doc.setLineWidth(0.5);
        doc.line(120, finalY + 20, 195, finalY + 20);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 140, 50);
        doc.text('TOTAL:', 120, finalY + 28);
        doc.text(`€${parseFloat(invoiceData.total).toFixed(2)}`, 195, finalY + 28, { align: 'right' });

        // Footer
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 160);
        doc.text('Este documento ha sido generado automáticamente por el Panel de Automatízatelo.', 105, 285, { align: 'center' });

        return doc;
    };

    const handleGenerateInvoice = async () => {
        if (uninvoicedLines.length === 0) {
            showNotification('No hay líneas pendientes de facturar', 'error');
            return;
        }
        setInvoiceLoading(true);
        try {
            // Generate invoice number: FAC-{alias o id corto}-{contador}
            const invoiceCount = invoices.length + 1;
            const alias = project.id_alias || project.id.substring(0, 8).toUpperCase();
            const invoiceNumber = `FAC-${alias}-${String(invoiceCount).padStart(3, '0')}`;
            const today = new Date().toISOString().split('T')[0];

            // Snapshot de líneas
            const lineItemsSnapshot = uninvoicedLines.map(l => ({
                description: l.description,
                quantity: l.quantity || 1,
                unit_price: l.unit_price,
                iva_percent: l.iva_percent,
                base: l.base,
                iva: l.iva,
                total: l.total,
                type: l.isService ? 'servicio' : 'manual'
            }));

            // Crear factura en BD
            const { data: invoice, error: invErr } = await supabase
                .from('project_invoices')
                .insert([{
                    project_id: id,
                    invoice_number: invoiceNumber,
                    invoice_date: today,
                    subtotal: uninvoicedSubtotal,
                    iva_total: uninvoicedIVA,
                    total: uninvoicedTotal,
                    line_items: lineItemsSnapshot,
                    status: 'emitida'
                }])
                .select()
                .single();
            if (invErr) throw invErr;

            // Marcar servicios como facturados
            const uninvoicedServiceIds = projectServices.filter(ps => !ps.invoice_id).map(ps => ps.id);
            if (uninvoicedServiceIds.length > 0) {
                await supabase.from('project_services').update({ invoice_id: invoice.id }).in('id', uninvoicedServiceIds);
            }

            // Marcar líneas manuales como facturadas
            const uninvoicedBudgetIds = budgetLines.filter(bl => !bl.invoice_id).map(bl => bl.id);
            if (uninvoicedBudgetIds.length > 0) {
                await supabase.from('project_budget_lines').update({ invoice_id: invoice.id }).in('id', uninvoicedBudgetIds);
            }

            // Nombre del archivo
            const dateStr = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
            const fileName = `Factura - ${project.name} - ${alias} - ${dateStr}`;

            // Crear entrada en project_files
            await supabase.from('project_files').insert([{
                project_id: id,
                name: fileName,
                size: `${lineItemsSnapshot.length} líneas`,
                file_type: 'FACTURA',
                url: `invoice:${invoice.id}`
            }]);

            // Generar y descargar PDF
            const invoiceData = {
                ...invoice,
                projectName: project.name,
                projectAlias: project.id_alias,
                clientName: project.client
            };
            const doc = generateInvoicePDF(invoiceData);
            doc.save(`${fileName}.pdf`);

            showNotification(`Factura ${invoiceNumber} generada correctamente ✅`);
            fetchProjectData();
            fetchBudgetData();
        } catch (error) {
            showNotification(`Error generando factura: ${error.message}`, 'error');
        } finally {
            setInvoiceLoading(false);
        }
    };

    const handleRedownloadInvoice = (invoiceId) => {
        const inv = invoices.find(i => i.id === invoiceId);
        if (!inv) { showNotification('Factura no encontrada', 'error'); return; }
        const invoiceData = {
            ...inv,
            projectName: project?.name,
            projectAlias: project?.id_alias,
            clientName: project?.client
        };
        const doc = generateInvoicePDF(invoiceData);
        const alias = project?.id_alias || project?.id?.substring(0, 8).toUpperCase() || '';
        const dateStr = new Date(inv.invoice_date).toLocaleDateString('es-ES').replace(/\//g, '-');
        doc.save(`Factura - ${project?.name} - ${alias} - ${dateStr}.pdf`);
    };

    const handleGenerateBudgetPDF = async () => {
        setInvoiceLoading(true);
        try {
            const doc = new jsPDF();
            const pName = project?.name || 'Proyecto';
            const pAlias = project?.id_alias || '';
            const pClient = project?.client || 'Cliente';
            const today = new Date().toLocaleDateString('es-ES');

            // Header
            doc.setFillColor(30, 30, 40);
            doc.rect(0, 0, 220, 42, 'F');
            doc.setTextColor(255, 140, 50);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('PRESUPUESTO', 15, 22);
            doc.setFontSize(10);
            doc.setTextColor(180, 180, 190);
            doc.text(`Fecha: ${today}`, 15, 32);

            // Project / Client info
            doc.setTextColor(60, 60, 70);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('PROYECTO:', 15, 55);
            doc.setFont('helvetica', 'normal');
            doc.text(`${pName}${pAlias ? ` (${pAlias})` : ''}`, 50, 55);
            doc.setFont('helvetica', 'bold');
            doc.text('CLIENTE:', 15, 62);
            doc.setFont('helvetica', 'normal');
            doc.text(pClient, 50, 62);

            // Table
            const tableRows = allBudgetLines.map(l => [
                l.description,
                l.quantity?.toString() || '1',
                `€${parseFloat(l.unit_price || 0).toFixed(2)}`,
                `${l.iva_percent || 21}%`,
                `€${parseFloat(l.base || 0).toFixed(2)}`,
                `€${parseFloat(l.total || 0).toFixed(2)}`
            ]);

            doc.autoTable({
                startY: 72,
                head: [['Concepto', 'Cant.', 'Precio Unit.', 'IVA', 'Base', 'Total']],
                body: tableRows,
                headStyles: { fillColor: [255, 140, 50], textColor: 255, fontSize: 9, fontStyle: 'bold' },
                bodyStyles: { fontSize: 9, textColor: [50, 50, 60] },
                alternateRowStyles: { fillColor: [245, 245, 248] },
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { halign: 'center', cellWidth: 18 },
                    2: { halign: 'right', cellWidth: 28 },
                    3: { halign: 'center', cellWidth: 18 },
                    4: { halign: 'right', cellWidth: 28 },
                    5: { halign: 'right', cellWidth: 28 },
                },
                margin: { left: 15, right: 15 },
            });

            const finalY = doc.lastAutoTable.finalY + 10;

            // Totals
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(80, 80, 90);
            doc.text('Subtotal (Base):', 120, finalY + 8);
            doc.text(`€${budgetSubtotal.toFixed(2)}`, 195, finalY + 8, { align: 'right' });
            doc.text('IVA Total:', 120, finalY + 16);
            doc.text(`€${budgetIVA.toFixed(2)}`, 195, finalY + 16, { align: 'right' });
            doc.setFontSize(13);
            doc.setTextColor(255, 140, 50);
            doc.text('TOTAL:', 120, finalY + 28);
            doc.text(`€${budgetTotal.toFixed(2)}`, 195, finalY + 28, { align: 'right' });

            // Save Snapshot
            const budgetCount = budgets.length + 1;
            const bAlias = project?.id_alias || project?.id?.substring(0, 8).toUpperCase() || '';
            const budgetNumber = `PRE-${bAlias}-${String(budgetCount).padStart(3, '0')}`;

            const lineItemsSnapshot = allBudgetLines.map(l => ({
                description: l.description,
                quantity: l.quantity || 1,
                unit_price: l.unit_price,
                iva_percent: l.iva_percent,
                base: l.base,
                iva: l.iva,
                total: l.total,
                type: l.isService ? 'servicio' : 'manual'
            }));

            const { data: newBudget, error: budErr } = await supabase
                .from('project_budgets')
                .insert([{
                    project_id: id,
                    budget_number: budgetNumber,
                    budget_date: new Date().toISOString().split('T')[0],
                    subtotal: budgetSubtotal,
                    iva_total: budgetIVA,
                    total: budgetTotal,
                    line_items: lineItemsSnapshot,
                    status: 'pendiente'
                }])
                .select()
                .single();

            if (budErr) throw budErr;

            const fileName = `Presupuesto - ${pName} - ${pAlias} - ${today.replace(/\//g, '-')}`;

            await supabase.from('project_files').insert([{
                project_id: id,
                name: fileName,
                size: `${allBudgetLines.length} líneas`,
                file_type: 'PRESUPUESTO',
                url: `budget:${newBudget.id}`
            }]);

            doc.save(`${fileName}.pdf`);
            showNotification('Presupuesto generado y guardado ✅');
            fetchProjectData();
            fetchBudgetData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setInvoiceLoading(false);
        }
    };

    const handleRedownloadBudget = (budgetId) => {
        const bud = budgets.find(b => b.id === budgetId);
        if (!bud) { showNotification('Presupuesto no encontrado', 'error'); return; }

        const doc = new jsPDF();
        const pName = project?.name || 'Proyecto';
        const pAlias = project?.id_alias || '';
        const pClient = project?.client || 'Cliente';
        const bDate = new Date(bud.budget_date).toLocaleDateString('es-ES');

        // Header
        doc.setFillColor(30, 30, 40);
        doc.rect(0, 0, 220, 42, 'F');
        doc.setTextColor(255, 140, 50);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('PRESUPUESTO', 15, 22);
        doc.setFontSize(10);
        doc.setTextColor(180, 180, 190);
        doc.text(`N.º ${bud.budget_number}`, 15, 32);
        doc.text(`Fecha: ${bDate}`, 15, 38);

        // Project / Client info
        doc.setTextColor(60, 60, 70);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PROYECTO:', 15, 55);
        doc.setFont('helvetica', 'normal');
        doc.text(`${pName}${pAlias ? ` (${pAlias})` : ''}`, 50, 55);
        doc.setFont('helvetica', 'bold');
        doc.text('CLIENTE:', 15, 62);
        doc.setFont('helvetica', 'normal');
        doc.text(pClient, 50, 62);

        // Table
        const tableRows = (bud.line_items || []).map(l => [
            l.description,
            l.quantity?.toString() || '1',
            `€${parseFloat(l.unit_price || 0).toFixed(2)}`,
            `${l.iva_percent || 21}%`,
            `€${parseFloat(l.base || 0).toFixed(2)}`,
            `€${parseFloat(l.total || 0).toFixed(2)}`
        ]);

        doc.autoTable({
            startY: 72,
            head: [['Concepto', 'Cant.', 'Precio Unit.', 'IVA', 'Base', 'Total']],
            body: tableRows,
            headStyles: { fillColor: [255, 140, 50], textColor: 255, fontSize: 9, fontStyle: 'bold' },
            bodyStyles: { fontSize: 9, textColor: [50, 50, 60] },
            alternateRowStyles: { fillColor: [245, 245, 248] },
            columnStyles: {
                0: { cellWidth: 60 },
                1: { halign: 'center', cellWidth: 18 },
                2: { halign: 'right', cellWidth: 28 },
                3: { halign: 'center', cellWidth: 18 },
                4: { halign: 'right', cellWidth: 28 },
                5: { halign: 'right', cellWidth: 28 },
            },
            margin: { left: 15, right: 15 },
        });

        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 90);
        doc.text('Subtotal (Base):', 120, finalY + 8);
        doc.text(`€${parseFloat(bud.subtotal).toFixed(2)}`, 195, finalY + 8, { align: 'right' });
        doc.text('IVA Total:', 120, finalY + 16);
        doc.text(`€${parseFloat(bud.iva_total).toFixed(2)}`, 195, finalY + 16, { align: 'right' });
        doc.setFontSize(13);
        doc.setTextColor(255, 140, 50);
        doc.text('TOTAL:', 120, finalY + 28);
        doc.text(`€${parseFloat(bud.total).toFixed(2)}`, 195, finalY + 28, { align: 'right' });

        const fileName = `Presupuesto - ${pName} - ${pAlias} - ${bDate.replace(/\//g, '-')}`;
        doc.save(`${fileName}.pdf`);
    };

    const handleUpdateBudgetStatus = async (budgetId, newStatus) => {
        try {
            const bud = budgets.find(b => b.id === budgetId);
            if (!bud) throw new Error('Presupuesto no encontrado');

            // Update status in project_budgets
            const { error } = await supabase
                .from('project_budgets')
                .update({ status: newStatus })
                .eq('id', budgetId);

            if (error) throw error;

            if (newStatus === 'confirmado') {
                // Logic to convert to invoice
                // 1. Generate invoice number
                const invoiceCount = invoices.length + 1;
                const alias = project.id_alias || project.id.substring(0, 8).toUpperCase();
                const invoiceNumber = `FAC-${alias}-${String(invoiceCount).padStart(3, '0')}`;
                const today = new Date().toISOString().split('T')[0];

                // 2. Create invoice in DB using snapshot lines
                const { data: invoice, error: invErr } = await supabase
                    .from('project_invoices')
                    .insert([{
                        project_id: id,
                        invoice_number: invoiceNumber,
                        invoice_date: today,
                        subtotal: bud.subtotal,
                        iva_total: bud.iva_total,
                        total: bud.total,
                        line_items: bud.line_items,
                        status: 'emitida'
                    }])
                    .select()
                    .single();

                if (invErr) throw invErr;

                // 3. Mark current project lines as invoiced (if any match the confirmed budget)
                // To keep it simple, we mark all current uninvoiced lines as belonging to this invoice
                // as confirming a budget implies invoicing those items.
                const uninvoicedServiceIds = projectServices.filter(ps => !ps.invoice_id).map(ps => ps.id);
                if (uninvoicedServiceIds.length > 0) {
                    await supabase.from('project_services').update({ invoice_id: invoice.id }).in('id', uninvoicedServiceIds);
                }
                const uninvoicedBudgetIds = budgetLines.filter(bl => !bl.invoice_id).map(bl => bl.id);
                if (uninvoicedBudgetIds.length > 0) {
                    await supabase.from('project_budget_lines').update({ invoice_id: invoice.id }).in('id', uninvoicedBudgetIds);
                }

                // 4. Create file record for the invoice
                const dateStr = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
                const fileName = `Factura - ${project.name} - ${alias} - ${dateStr}`;
                await supabase.from('project_files').insert([{
                    project_id: id,
                    name: fileName,
                    size: `${(bud.line_items || []).length} líneas`,
                    file_type: 'FACTURA',
                    url: `invoice:${invoice.id}`
                }]);

                showNotification('¡Presupuesto confirmado y factura generada! 🚀');
            } else if (newStatus === 'denegado') {
                showNotification('Presupuesto marcado como denegado ✖️');
            }

            fetchBudgetData();
            fetchProjectData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // ═══════════════════════════════════════
    // PAGOS / COBROS
    // ═══════════════════════════════════════

    const PAYMENT_METHODS = [
        { value: 'efectivo', label: 'Efectivo', icon: Banknote, color: 'text-emerald-500' },
        { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard, color: 'text-blue-500' },
        { value: 'transferencia', label: 'Transferencia', icon: Building2, color: 'text-violet-500' },
        { value: 'bizum', label: 'Bizum', icon: Smartphone, color: 'text-cyan-500' },
        { value: 'otro', label: 'Otro', icon: Wallet, color: 'text-amber-500' },
    ];

    const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const pendingBalance = totalInvoiced - totalPaid;
    const paidPercent = totalInvoiced > 0 ? Math.min((totalPaid / totalInvoiced) * 100, 100) : 0;

    const getPaymentMethodInfo = (method) => PAYMENT_METHODS.find(m => m.value === method) || PAYMENT_METHODS[4];

    // Generar PDF de recibo
    const generateReceiptPDF = (paymentData) => {
        const doc = new jsPDF();
        const pName = project?.name || 'Proyecto';
        const pAlias = project?.id_alias || '';
        const pClient = project?.client || 'Cliente';
        const payMethod = getPaymentMethodInfo(paymentData.payment_method);

        // Header
        doc.setFillColor(30, 30, 40);
        doc.rect(0, 0, 220, 42, 'F');
        doc.setTextColor(80, 200, 120);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('RECIBO DE PAGO', 15, 22);
        doc.setFontSize(10);
        doc.setTextColor(180, 180, 190);
        doc.text(`N.\u00ba ${paymentData.payment_number}`, 15, 32);
        doc.text(`Fecha: ${new Date(paymentData.payment_date).toLocaleDateString('es-ES')}`, 15, 38);

        // Company info (right side)
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Autom\u00e1t\u00edzatelo', 195, 18, { align: 'right' });
        doc.setFontSize(8);
        doc.setTextColor(180, 180, 190);
        doc.text('automatizatelo.com', 195, 25, { align: 'right' });

        // Project / Client info
        doc.setTextColor(60, 60, 70);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PROYECTO:', 15, 55);
        doc.setFont('helvetica', 'normal');
        doc.text(`${pName}${pAlias ? ` (${pAlias})` : ''}`, 50, 55);
        doc.setFont('helvetica', 'bold');
        doc.text('CLIENTE:', 15, 62);
        doc.setFont('helvetica', 'normal');
        doc.text(pClient, 50, 62);

        // Payment details box
        doc.setFillColor(245, 250, 245);
        doc.roundedRect(15, 75, 180, 60, 4, 4, 'F');
        doc.setDrawColor(80, 200, 120);
        doc.setLineWidth(0.5);
        doc.roundedRect(15, 75, 180, 60, 4, 4, 'S');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 70);
        doc.text('IMPORTE RECIBIDO:', 25, 90);
        doc.setFontSize(28);
        doc.setTextColor(80, 200, 120);
        doc.text(`\u20ac${parseFloat(paymentData.amount).toFixed(2)}`, 25, 108);

        doc.setFontSize(10);
        doc.setTextColor(80, 80, 90);
        doc.setFont('helvetica', 'bold');
        doc.text('M\u00e9todo de Pago:', 120, 90);
        doc.setFont('helvetica', 'normal');
        doc.text(payMethod.label, 120, 100);

        if (paymentData.notes) {
            doc.setFont('helvetica', 'bold');
            doc.text('Notas:', 120, 115);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            const splitNotes = doc.splitTextToSize(paymentData.notes, 65);
            doc.text(splitNotes, 120, 123);
        }

        // Balance summary
        const summaryY = 150;
        doc.setDrawColor(200, 200, 210);
        doc.line(15, summaryY, 195, summaryY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 90);
        doc.text('RESUMEN DE CUENTA', 15, summaryY + 10);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Total Facturado:', 15, summaryY + 22);
        doc.text(`\u20ac${totalInvoiced.toFixed(2)}`, 195, summaryY + 22, { align: 'right' });

        const totalPaidWithCurrent = totalPaid + parseFloat(paymentData.amount || 0);
        doc.text('Total Cobrado (inc. este pago):', 15, summaryY + 32);
        doc.setTextColor(80, 200, 120);
        doc.text(`\u20ac${totalPaidWithCurrent.toFixed(2)}`, 195, summaryY + 32, { align: 'right' });

        doc.setDrawColor(80, 200, 120);
        doc.setLineWidth(0.5);
        doc.line(15, summaryY + 36, 195, summaryY + 36);

        const remainingBalance = totalInvoiced - totalPaidWithCurrent;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        if (remainingBalance <= 0) {
            doc.setTextColor(80, 200, 120);
            doc.text('SALDO PENDIENTE:', 15, summaryY + 46);
            doc.text('\u20ac0.00 - PAGADO COMPLETO \u2713', 195, summaryY + 46, { align: 'right' });
        } else {
            doc.setTextColor(220, 120, 50);
            doc.text('SALDO PENDIENTE:', 15, summaryY + 46);
            doc.text(`\u20ac${remainingBalance.toFixed(2)}`, 195, summaryY + 46, { align: 'right' });
        }

        // Footer
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 160);
        doc.text('Este recibo ha sido generado autom\u00e1ticamente por el Panel de Autom\u00e1t\u00edzatelo.', 105, 285, { align: 'center' });

        return doc;
    };

    const handleRegisterPayment = async (e) => {
        e.preventDefault();
        const amount = parseFloat(newPayment.amount);
        if (!amount || amount <= 0) {
            showNotification('Introduce un importe v\u00e1lido', 'error');
            return;
        }
        if (totalInvoiced <= 0) {
            showNotification('No hay facturas emitidas para registrar pagos', 'error');
            return;
        }
        setFormLoading(true);
        try {
            // Generate payment number
            const paymentCount = payments.length + 1;
            const alias = project.id_alias || project.id.substring(0, 8).toUpperCase();
            const paymentNumber = `REC-${alias}-${String(paymentCount).padStart(3, '0')}`;
            const today = new Date().toISOString().split('T')[0];

            // Insert payment in DB
            const { data: payment, error: payErr } = await supabase
                .from('project_payments')
                .insert([{
                    project_id: id,
                    payment_number: paymentNumber,
                    payment_date: today,
                    amount: amount,
                    payment_method: newPayment.payment_method,
                    notes: newPayment.notes || null,
                    created_by: currentProfile?.id || null
                }])
                .select()
                .single();
            if (payErr) throw payErr;

            // Create file name
            const dateStr = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
            const fileName = `Recibo - ${project.name} - ${alias} - ${dateStr}`;

            // Save to project files
            await supabase.from('project_files').insert([{
                project_id: id,
                name: fileName,
                size: `\u20ac${amount.toFixed(2)}`,
                file_type: 'RECIBO',
                url: `payment:${payment.id}`
            }]);

            // Generate and download receipt PDF
            const doc = generateReceiptPDF(payment);
            doc.save(`${fileName}.pdf`);

            setPaymentModal(false);
            setNewPayment({ amount: '', payment_method: 'transferencia', notes: '' });
            showNotification(`Pago ${paymentNumber} registrado correctamente \u2705`);
            fetchBudgetData();
            fetchProjectData();
        } catch (error) {
            showNotification(`Error registrando pago: ${error.message}`, 'error');
        } finally {
            setFormLoading(false);
        }
    };

    const handleRedownloadReceipt = (paymentId) => {
        const pay = payments.find(p => p.id === paymentId);
        if (!pay) { showNotification('Recibo no encontrado', 'error'); return; }
        const doc = generateReceiptPDF(pay);
        const alias = project?.id_alias || project?.id?.substring(0, 8).toUpperCase() || '';
        const dateStr = new Date(pay.payment_date).toLocaleDateString('es-ES').replace(/\//g, '-');
        doc.save(`Recibo - ${project?.name} - ${alias} - ${dateStr}.pdf`);
    };

    if (loading && !project) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0F0716]">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!project) return <div className="p-20 text-center text-variable-main">Proyecto no encontrado</div>;

    const progressValue = project.total_hours > 0 ? (project.actual_hours / project.total_hours) * 100 : 0;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const taskProgress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <Link to="/projects" className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors mb-6 sm:mb-8 group">
                        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="font-medium">Volver a Proyectos</span>
                    </Link>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest leading-none">
                                {darkMode ? 'Claro' : 'Oscuro'}
                            </span>
                        </button>
                    </div>
                </div>

                <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-8 sm:mb-12">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg ${project.status === 'Completado' ? 'bg-emerald-500 text-white' : 'bg-primary text-white'
                                }`}>
                                {project.status}
                            </span>
                            <span className="text-variable-muted text-[10px] sm:text-xs font-bold tracking-widest uppercase">ID: {project.id_alias || project.id.slice(0, 8)}</span>
                        </div>
                        <h1 className="text-3xl sm:text-5xl font-bold font-display tracking-tight text-variable-main">{project.name}</h1>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-variable-muted text-base sm:text-lg">
                            <p className="flex items-center gap-2">
                                Cliente: <span className="text-variable-main font-bold">{project.client}</span>
                            </p>
                            {project.leads && (
                                <p className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-xl text-xs font-bold text-primary border border-primary/20">
                                    <Target size={14} />
                                    Lead: <Link to="/leads" className="hover:underline">{project.leads.company || `${project.leads.first_name} ${project.leads.last_name}`}</Link>
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <button className="glass flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm text-variable-main hover:brightness-110 transition-all shadow-sm">
                            <Share2 size={18} /> Compartir
                        </button>
                        <button className="bg-primary text-white flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-sm hover:brightness-110 transition-all shadow-xl shadow-primary/20">
                            <Edit3 size={18} /> Editar Proyecto
                        </button>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* HITOS */}
                    <div className="lg:col-span-3">
                        <div className="glass rounded-[2rem] p-8 h-full min-h-[400px]">
                            <h3 className="text-xl font-bold mb-10 flex items-center justify-between text-variable-main">
                                <div className="flex items-center gap-3">
                                    <Calendar size={20} className="text-primary" /> Hitos
                                </div>
                                <button onClick={() => setMilestoneModal(true)} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                    <Plus size={16} />
                                </button>
                            </h3>
                            <div className="relative space-y-12 pl-4 border-l border-variable">
                                {milestones.length === 0 && <p className="text-xs text-variable-muted italic">No hay hitos definidos.</p>}
                                {milestones.map((m, i) => (
                                    <div key={m.id} className="relative">
                                        <div className={`absolute -left-[25.5px] top-1 size-4 rounded-full border-4 border-variable shadow-lg ${m.status === 'completed' ? 'bg-primary shadow-primary/40' : (m.status === 'in_progress' ? 'bg-primary animate-pulse' : 'bg-variable-muted opacity-50')
                                            }`} />
                                        <div className="flex justify-between items-start group">
                                            <div>
                                                <p className={`text-sm font-bold ${m.status === 'pending' ? 'text-variable-muted' : (m.status === 'in_progress' ? 'text-primary' : 'text-variable-main')}`}>
                                                    {m.title}
                                                </p>
                                                <p className="text-xs text-variable-muted mt-1">{m.target_date ? new Date(m.target_date).toLocaleDateString() : (m.status === 'in_progress' ? 'En curso' : 'Pendiente')}</p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const newStatus = m.status === 'completed' ? 'pending' : 'completed';
                                                    await supabase.from('project_milestones').update({ status: newStatus }).eq('id', m.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-primary hover:bg-primary/10 rounded-md"
                                                title="Cambiar Estado"
                                            >
                                                <CheckCircle2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-6 space-y-10">
                        {/* CHART RESUMEN */}
                        <div className="glass rounded-[2.5rem] p-10 flex flex-col items-center">
                            <h3 className="text-xl font-bold self-start mb-10 text-variable-main">Resumen de Progreso</h3>
                            <div className="relative size-60 flex items-center justify-center">
                                <svg className="size-full -rotate-90">
                                    <circle cx="120" cy="120" r="100" fill="transparent" stroke="currentColor" strokeWidth="16" className="text-variable-muted opacity-10" />
                                    <motion.circle
                                        initial={{ strokeDashoffset: 628 }}
                                        animate={{ strokeDashoffset: 628 * (1 - (taskProgress / 100)) }}
                                        cx="120" cy="120" r="100" fill="transparent" stroke="#f3791b" strokeWidth="16"
                                        strokeDasharray="628" strokeLinecap="round"
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                    />
                                </svg>
                                <div className="absolute flex flex-col items-center">
                                    <span className="text-5xl font-black font-display tracking-tighter text-variable-main">{Math.round(taskProgress)}%</span>
                                    <span className="text-[10px] font-bold text-variable-muted uppercase tracking-widest mt-1 text-center">Tareas Listas</span>
                                </div>
                            </div>
                        </div>

                        {/* TAREAS */}
                        <div className="glass rounded-[2rem] p-8 overflow-visible">
                            <h3 className="font-bold mb-6 flex items-center justify-between text-variable-main">
                                <div className="flex items-center gap-2">
                                    Tareas Prioritarias
                                    <span className="text-xs font-normal text-variable-muted">({tasks.length})</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setTaskModal(true)} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                        <Plus size={16} />
                                    </button>
                                    <button className="text-primary text-xs hover:underline">Gestionar Kanban</button>
                                </div>
                            </h3>
                            <div className="space-y-4">
                                {tasks.length === 0 && (
                                    <div className="py-10 text-center border-2 border-dashed border-variable rounded-3xl">
                                        <p className="text-sm text-variable-muted">No hay tareas pendientes.</p>
                                    </div>
                                )}
                                {tasks.slice(0, 5).map((task) => (
                                    <div key={task.id} className="p-5 rounded-2xl bg-white/5 border border-variable flex items-center justify-between hover:bg-white/10 transition-all group cursor-pointer">
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const newStatus = task.status === 'done' ? 'todo' : 'done';
                                                    await supabase.from('project_tasks').update({ status: newStatus }).eq('id', task.id);
                                                }}
                                                className={`p-2 rounded-xl transition-all ${task.status === 'done' ? 'bg-emerald-500/10 text-emerald-500 scale-110' : 'bg-primary/10 text-primary hover:scale-110'}`}
                                            >
                                                {task.status === 'done' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
                                            </button>
                                            <div>
                                                <p className={`font-bold text-sm ${task.status === 'done' ? 'text-variable-muted line-through' : 'text-variable-main'}`}>{task.title}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase inline-block ${task.priority === 'Alta' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                        (task.priority === 'Media' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')
                                                        }`}>
                                                        {task.priority}
                                                    </span>
                                                    {task.assigned_to && (
                                                        <span className="text-[9px] text-variable-muted font-bold uppercase italic">
                                                            Asignado a: {users.find(u => u.id === task.assigned_to)?.first_name || '...'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 space-y-10 order-first lg:order-last">
                        {/* RECURSOS / HORAS */}
                        <div className="glass rounded-[2rem] p-8 flex flex-col">
                            <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-variable-main">
                                Recursos
                                <BarChart3 size={18} className="text-variable-muted" />
                            </h3>
                            <div className="space-y-6">
                                <div className="space-y-2 text-variable-main">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                        <span className="text-variable-muted">Horas Reales</span>
                                        <span>{project.actual_hours} / {project.total_hours}</span>
                                    </div>
                                    <div className="h-2 bg-white/5 border border-variable rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(progressValue, 100)}%` }} className="h-full bg-primary" />
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Eficiencia</p>
                                    <p className="text-2xl font-black text-variable-main">
                                        {progressValue > 80 ? '+12.4%' : (progressValue > 50 ? '+5.2%' : 'Nueva')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ARCHIVOS */}
                        <div className="glass rounded-[2.5rem] p-8">
                            <h3 className="text-lg font-bold mb-8 flex items-center justify-between text-variable-main">
                                Archivos
                                <button className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                    <Plus size={16} />
                                </button>
                            </h3>
                            <div className="space-y-4">
                                {files.length === 0 && <p className="text-xs text-variable-muted italic">No hay archivos adjuntos.</p>}
                                {files.map((file) => {
                                    const isInvoice = file.file_type === 'FACTURA' && file.url?.startsWith('invoice:');
                                    const isReceipt = file.file_type === 'RECIBO' && file.url?.startsWith('payment:');
                                    const isBudget = file.file_type === 'PRESUPUESTO' && file.url?.startsWith('budget:');
                                    const invoiceId = isInvoice ? file.url.replace('invoice:', '') : null;
                                    const paymentId = isReceipt ? file.url.replace('payment:', '') : null;
                                    const budgetId = isBudget ? file.url.replace('budget:', '') : null;
                                    const budgetObj = isBudget ? budgets.find(b => b.id === budgetId) : null;

                                    return (
                                        <div key={file.id} className="group relative">
                                            <div className="flex items-center gap-4 cursor-pointer text-variable-main" onClick={() => {
                                                if (isInvoice) handleRedownloadInvoice(invoiceId);
                                                else if (isReceipt) handleRedownloadReceipt(paymentId);
                                                else if (isBudget) handleRedownloadBudget(budgetId);
                                                else if (file.url) window.open(file.url, '_blank');
                                            }}>
                                                <div className={`p-3 border rounded-2xl transition-colors ${isInvoice || isBudget
                                                    ? 'bg-primary/10 border-primary/30 text-primary group-hover:bg-primary/20'
                                                    : isReceipt
                                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 group-hover:bg-emerald-500/20'
                                                        : 'bg-white/5 border-variable group-hover:text-primary'
                                                    }`}>
                                                    {isInvoice || isBudget ? <Receipt size={20} /> : isReceipt ? <Banknote size={20} /> : <Download size={20} />}
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <p className="text-sm font-bold truncate">{file.name}</p>
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-[10px] font-bold uppercase ${isInvoice || isBudget ? 'text-primary' : isReceipt ? 'text-emerald-500' : 'text-variable-muted'
                                                            }`}>{file.size || '---'} • {file.file_type || 'FILE'}</p>
                                                        {isBudget && budgetObj && (
                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${budgetObj.status === 'confirmado' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : (budgetObj.status === 'denegado' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-primary/10 text-primary border-primary/20')
                                                                }`}>
                                                                {budgetObj.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {(isInvoice || isReceipt || isBudget) && (
                                                    <div className={`p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity ${isReceipt ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`} title="Descargar PDF">
                                                        <Download size={14} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Acciones de Presupuesto */}
                                            {isBudget && budgetObj && budgetObj.status === 'pendiente' && (
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all bg-dark/80 backdrop-blur-md p-1 rounded-xl border border-variable shadow-xl mr-10">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleUpdateBudgetStatus(budgetId, 'confirmado'); }}
                                                        className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                        title="Confirmar Presupuesto (Generar Factura)"
                                                    >
                                                        <CheckCircle2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleUpdateBudgetStatus(budgetId, 'denegado'); }}
                                                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                        title="Denegar Presupuesto"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════ */}
                {/* SECCIÓN PRESUPUESTO / SERVICIOS                */}
                {/* ═══════════════════════════════════════════════ */}
                <section className="mt-10">
                    <div className="glass rounded-[2.5rem] p-8 sm:p-10">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                            <button onClick={() => setBudgetExpanded(!budgetExpanded)} className="flex items-center gap-3 group">
                                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                    <Receipt size={22} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-variable-main flex items-center gap-2">
                                        Presupuesto / Servicios
                                        {budgetExpanded ? <ChevronUp size={18} className="text-variable-muted" /> : <ChevronDown size={18} className="text-variable-muted" />}
                                    </h3>
                                    <p className="text-xs text-variable-muted italic">Líneas de servicio contratadas y extras manuales</p>
                                </div>
                            </button>
                            <div className="flex items-center gap-3">
                                <button onClick={handleGenerateBudgetPDF} className="flex items-center gap-2 px-4 py-2.5 glass text-variable-muted rounded-xl text-xs font-bold hover:text-primary transition-all">
                                    <FileText size={14} /> Presupuesto PDF
                                </button>
                                <button onClick={() => setBudgetLineModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all">
                                    <Plus size={14} /> Añadir Línea Manual
                                </button>
                                <button disabled={invoiceLoading || uninvoicedLines.length === 0} onClick={handleGenerateInvoice} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20 ${uninvoicedLines.length === 0 ? 'bg-variable text-variable-muted cursor-not-allowed opacity-50' : 'bg-primary text-white hover:brightness-110'}`}>
                                    <Receipt size={14} /> {invoiceLoading ? 'Generando...' : uninvoicedLines.length === 0 ? 'Todo Facturado' : `Facturar (${uninvoicedLines.length} líneas)`}
                                </button>
                            </div>
                        </div>

                        {budgetExpanded && (
                            <div className="space-y-4">
                                {/* Header de la tabla */}
                                <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-variable-muted">
                                    <div className="col-span-5">Concepto</div>
                                    <div className="col-span-1 text-right">Cant.</div>
                                    <div className="col-span-2 text-right">Precio Unit.</div>
                                    <div className="col-span-1 text-right">IVA %</div>
                                    <div className="col-span-2 text-right">Total</div>
                                    <div className="col-span-1"></div>
                                </div>

                                {allBudgetLines.length === 0 && (
                                    <div className="py-12 text-center border-2 border-dashed border-variable rounded-3xl">
                                        <Receipt size={32} className="mx-auto text-variable-muted mb-3 opacity-50" />
                                        <p className="text-sm text-variable-muted">No hay líneas de presupuesto.</p>
                                        <p className="text-xs text-variable-muted italic mt-1">Añade servicios al crear el proyecto o agrega líneas manuales.</p>
                                    </div>
                                )}

                                {/* Todas las líneas — con badge de estado */}
                                {allBudgetLines.map((line) => {
                                    const isEditing = editingLineId === line.id;
                                    return (
                                        <div key={`${line.isService ? 'svc' : 'man'}-${line.id}`} className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center px-5 py-4 rounded-2xl border transition-colors ${line.invoiced ? 'bg-emerald-500/5 border-emerald-500/20 opacity-70' : isEditing ? 'bg-primary/5 border-primary/50' : 'bg-white/5 border-variable hover:bg-white/[0.08]'}`}>
                                            <div className="sm:col-span-5 flex items-center gap-3">
                                                <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${line.isService ? 'bg-primary/10' : 'bg-emerald-500/10'}`}>
                                                    {line.isService ? <Briefcase size={14} className="text-primary" /> : <DollarSign size={14} className="text-emerald-500" />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-variable-main">{line.description}</p>
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-[9px] font-bold uppercase tracking-widest ${line.isService ? 'text-primary' : 'text-emerald-500'}`}>
                                                            {line.isService ? 'Servicio contratado' : 'Línea manual'}
                                                        </p>
                                                        {line.invoiced && (
                                                            <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded-md uppercase">Facturada ✓</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="sm:col-span-1 text-right">
                                                {isEditing ? (
                                                    <input type="number" value={tempLine.quantity} onChange={e => setTempLine({ ...tempLine, quantity: e.target.value })} className="w-full bg-white/10 border border-primary/30 rounded-lg px-2 py-1 text-xs text-variable-main focus:outline-none focus:border-primary" />
                                                ) : (
                                                    <span className="text-xs text-variable-muted font-bold">{line.quantity || 1}</span>
                                                )}
                                            </div>
                                            <div className="sm:col-span-2 text-right">
                                                {isEditing ? (
                                                    <div className="relative">
                                                        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-variable-muted">€</span>
                                                        <input type="number" step="0.01" value={tempLine.unit_price} onChange={e => setTempLine({ ...tempLine, unit_price: e.target.value })} className="w-full bg-white/10 border border-primary/30 rounded-lg pl-4 pr-1 py-1 text-xs text-variable-main focus:outline-none focus:border-primary" />
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-variable-main font-bold">€{parseFloat(line.unit_price || 0).toFixed(2)}</span>
                                                )}
                                            </div>
                                            <div className="sm:col-span-1 text-right">
                                                {isEditing ? (
                                                    <input type="number" value={tempLine.iva_percent} onChange={e => setTempLine({ ...tempLine, iva_percent: e.target.value })} className="w-full bg-white/10 border border-primary/30 rounded-lg px-2 py-1 text-xs text-variable-main focus:outline-none focus:border-primary" />
                                                ) : (
                                                    <span className="text-xs text-variable-muted font-bold">{line.iva_percent}%</span>
                                                )}
                                            </div>
                                            <div className="sm:col-span-2 text-right text-sm font-black text-variable-main">€{line.total.toFixed(2)}</div>
                                            <div className="sm:col-span-1 flex justify-end gap-2">
                                                {!line.invoiced && (
                                                    isEditing ? (
                                                        <>
                                                            <button onClick={() => handleSaveLine(line.id, line.isService)} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 transition-colors rounded-lg" title="Guardar">
                                                                <CheckCircle2 size={16} />
                                                            </button>
                                                            <button onClick={() => { setEditingLineId(null); setTempLine(null); }} className="p-1.5 text-rose-500 hover:bg-rose-500/10 transition-colors rounded-lg" title="Cancelar">
                                                                <X size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => handleEditLine(line)} className="p-1.5 text-variable-muted hover:text-primary transition-colors rounded-lg hover:bg-primary/10" title="Editar">
                                                                <Edit3 size={14} />
                                                            </button>
                                                            <button onClick={() => line.isService ? handleRemoveProjectService(line.id) : handleDeleteBudgetLine(line.id)} className="p-1.5 text-variable-muted hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-500/10" title="Eliminar">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Facturas anteriores */}
                                {invoices.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-variable">
                                        <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest mb-3">Facturas Emitidas ({invoices.length})</p>
                                        {invoices.map(inv => (
                                            <div key={inv.id} onClick={() => handleRedownloadInvoice(inv.id)} className="flex items-center gap-4 p-3 rounded-2xl bg-primary/5 border border-primary/10 hover:bg-primary/10 cursor-pointer transition-colors mb-2">
                                                <div className="p-2 bg-primary/10 rounded-xl text-primary"><Receipt size={16} /></div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-variable-main">{inv.invoice_number}</p>
                                                    <p className="text-[9px] text-variable-muted font-bold">{new Date(inv.invoice_date).toLocaleDateString('es-ES')} • {inv.line_items?.length || 0} líneas</p>
                                                </div>
                                                <span className="text-sm font-black text-primary">€{parseFloat(inv.total).toFixed(2)}</span>
                                                <Download size={14} className="text-variable-muted" />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Totales */}
                                {allBudgetLines.length > 0 && (
                                    <div className="mt-6 pt-6 border-t border-variable">
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex justify-between w-full sm:w-80 text-sm">
                                                <span className="text-variable-muted font-bold">Total General (Base)</span>
                                                <span className="text-variable-main font-bold">€{budgetSubtotal.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between w-full sm:w-80 text-sm">
                                                <span className="text-variable-muted font-bold">IVA Total</span>
                                                <span className="text-variable-main font-bold">€{budgetIVA.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between w-full sm:w-80 text-lg pt-2 border-t border-variable">
                                                <span className="text-primary font-black uppercase tracking-widest text-sm">Total</span>
                                                <span className="text-primary font-black">€{budgetTotal.toFixed(2)}</span>
                                            </div>
                                            {uninvoicedLines.length > 0 && uninvoicedLines.length < allBudgetLines.length && (
                                                <div className="flex justify-between w-full sm:w-80 text-sm mt-3 pt-3 border-t border-dashed border-amber-500/30">
                                                    <span className="text-amber-500 font-bold text-xs uppercase">Pendiente de facturar</span>
                                                    <span className="text-amber-500 font-black">€{uninvoicedTotal.toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* ══════════════════════════════════════════════ */}
                {/* SECCIÓN COBROS / PAGOS                           */}
                {/* ══════════════════════════════════════════════ */}
                {invoices.length > 0 && (
                    <section className="mt-10">
                        <div className="glass rounded-[2.5rem] p-8 sm:p-10">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                                <button onClick={() => setPaymentsExpanded(!paymentsExpanded)} className="flex items-center gap-3 group">
                                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                                        <Banknote size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-variable-main flex items-center gap-2">
                                            Cobros / Pagos
                                            {paymentsExpanded ? <ChevronUp size={18} className="text-variable-muted" /> : <ChevronDown size={18} className="text-variable-muted" />}
                                        </h3>
                                        <p className="text-xs text-variable-muted italic">Registro de pagos recibidos del cliente</p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setPaymentModal(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all shadow-lg shadow-emerald-500/20"
                                >
                                    <Plus size={14} /> Registrar Cobro
                                </button>
                            </div>

                            {paymentsExpanded && (
                                <div className="space-y-6">
                                    {/* Balance Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Receipt size={16} className="text-primary" />
                                                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total Facturado</p>
                                            </div>
                                            <p className="text-2xl font-black text-variable-main">€{totalInvoiced.toFixed(2)}</p>
                                            <p className="text-[9px] text-variable-muted mt-1">{invoices.length} factura{invoices.length !== 1 ? 's' : ''} emitida{invoices.length !== 1 ? 's' : ''}</p>
                                        </div>
                                        <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                                            <div className="flex items-center gap-2 mb-2">
                                                <TrendingUp size={16} className="text-emerald-500" />
                                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Total Cobrado</p>
                                            </div>
                                            <p className="text-2xl font-black text-variable-main">€{totalPaid.toFixed(2)}</p>
                                            <p className="text-[9px] text-variable-muted mt-1">{payments.length} pago{payments.length !== 1 ? 's' : ''} registrado{payments.length !== 1 ? 's' : ''}</p>
                                        </div>
                                        <div className={`p-5 rounded-2xl border ${pendingBalance <= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/5 border-amber-500/20'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <TrendingDown size={16} className={pendingBalance <= 0 ? 'text-emerald-500' : 'text-amber-500'} />
                                                <p className={`text-[10px] font-black uppercase tracking-widest ${pendingBalance <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {pendingBalance <= 0 ? 'Pagado Completo' : 'Pendiente de Cobro'}
                                                </p>
                                            </div>
                                            <p className={`text-2xl font-black ${pendingBalance <= 0 ? 'text-emerald-500' : 'text-variable-main'}`}>
                                                {pendingBalance <= 0 ? '✓ €0.00' : `€${pendingBalance.toFixed(2)}`}
                                            </p>
                                            <p className="text-[9px] text-variable-muted mt-1">{Math.round(paidPercent)}% del total facturado</p>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-variable-muted uppercase tracking-widest">Progreso de Cobro</span>
                                            <span className="text-emerald-500">{Math.round(paidPercent)}%</span>
                                        </div>
                                        <div className="h-3 bg-white/5 border border-variable rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${paidPercent}%` }}
                                                transition={{ duration: 1.2, ease: 'easeOut' }}
                                                className={`h-full rounded-full ${paidPercent >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'}`}
                                            />
                                        </div>
                                    </div>

                                    {/* Payment History */}
                                    {payments.length === 0 ? (
                                        <div className="py-12 text-center border-2 border-dashed border-variable rounded-3xl">
                                            <Banknote size={32} className="mx-auto text-variable-muted mb-3 opacity-50" />
                                            <p className="text-sm text-variable-muted">No hay pagos registrados aún.</p>
                                            <p className="text-xs text-variable-muted italic mt-1">Registra el primer cobro para empezar a controlar el balance.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest">Historial de Cobros ({payments.length})</p>
                                            {payments.map((pay) => {
                                                const methodInfo = getPaymentMethodInfo(pay.payment_method);
                                                const MethodIcon = methodInfo.icon;
                                                return (
                                                    <div key={pay.id} onClick={() => handleRedownloadReceipt(pay.id)} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-variable hover:bg-white/[0.08] cursor-pointer transition-all group">
                                                        <div className={`p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20`}>
                                                            <MethodIcon size={18} className={methodInfo.color} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-bold text-variable-main">{pay.payment_number}</p>
                                                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${methodInfo.color} bg-white/5 border border-current/10`}>
                                                                    {methodInfo.label}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                <span className="text-[9px] text-variable-muted font-bold">
                                                                    {new Date(pay.payment_date).toLocaleDateString('es-ES')}
                                                                </span>
                                                                {pay.notes && (
                                                                    <span className="text-[9px] text-variable-muted italic truncate">
                                                                        {pay.notes}
                                                                    </span>
                                                                )}
                                                                {pay.created_by_user && (
                                                                    <span className="text-[8px] text-variable-muted italic">
                                                                        por {pay.created_by_user.first_name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-lg font-black text-emerald-500">€{parseFloat(pay.amount).toFixed(2)}</span>
                                                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" title="Descargar Recibo">
                                                            <Download size={14} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>
                )}
            </main>

            {/* MODALS */}
            <AnimatePresence>
                {milestoneModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMilestoneModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nuevo Hito</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Define un punto de control clave</p>
                            <form onSubmit={handleAddMilestone} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Título del Hito</label>
                                    <input required value={newMilestone.title} onChange={e => setNewMilestone({ ...newMilestone, title: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Fase de Diseño Lista" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Fecha Límite</label>
                                    <input required type="date" value={newMilestone.target_date} onChange={e => setNewMilestone({ ...newMilestone, target_date: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" />
                                </div>
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Guardando...' : 'Añadir Hito'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}

                {taskModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTaskModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nueva Tarea</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Asigna una acción específica</p>
                            <form onSubmit={handleAddTask} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Título de la Tarea</label>
                                    <input required value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Revisar contrato SLA" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Prioridad</label>
                                        <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                            <option>Baja</option>
                                            <option>Media</option>
                                            <option>Alta</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Asignar a</label>
                                        <select value={newTask.assigned_to} onChange={e => setNewTask({ ...newTask, assigned_to: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                            <option value="">Sin asignar</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.first_name} {u.second_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Crear Tarea' : 'Crear Tarea'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}

                {/* MODAL: NUEVA LÍNEA DE PRESUPUESTO */}
                {budgetLineModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBudgetLineModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nueva Línea de Presupuesto</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Añade un concepto manual con precio e IVA individual</p>
                            <form onSubmit={handleAddBudgetLine} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Concepto / Descripción</label>
                                    <input required value={newBudgetLine.description} onChange={e => setNewBudgetLine({ ...newBudgetLine, description: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Diseño landing page extra" />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Precio Unit. (€)</label>
                                        <input required type="number" step="0.01" min="0" value={newBudgetLine.unit_price} onChange={e => setNewBudgetLine({ ...newBudgetLine, unit_price: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" placeholder="0.00" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Cantidad</label>
                                        <input required type="number" min="1" value={newBudgetLine.quantity} onChange={e => setNewBudgetLine({ ...newBudgetLine, quantity: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">IVA %</label>
                                        <input required type="number" step="0.5" min="0" max="100" value={newBudgetLine.iva_percent} onChange={e => setNewBudgetLine({ ...newBudgetLine, iva_percent: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                    </div>
                                </div>
                                {/* Preview */}
                                {newBudgetLine.unit_price && (
                                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-sm">
                                        <div className="flex justify-between text-variable-muted">
                                            <span>Base:</span>
                                            <span className="font-bold text-variable-main">€{((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-variable-muted mt-1">
                                            <span>IVA ({newBudgetLine.iva_percent}%):</span>
                                            <span className="font-bold text-variable-main">€{(((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)) * ((parseFloat(newBudgetLine.iva_percent) || 0) / 100)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-primary font-black mt-2 pt-2 border-t border-primary/20">
                                            <span>Total:</span>
                                            <span>€{(((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)) * (1 + (parseFloat(newBudgetLine.iva_percent) || 0) / 100)).toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Guardando...' : 'Añadir Línea'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}

                {/* MODAL: REGISTRAR COBRO */}
                {paymentModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPaymentModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Registrar Cobro</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Registra un pago recibido del cliente</p>
                            <form onSubmit={handleRegisterPayment} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Importe (€)</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        value={newPayment.amount}
                                        onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })}
                                        className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main text-xl font-bold focus:outline-none focus:border-emerald-500/50"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Método de Pago</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {PAYMENT_METHODS.map(method => {
                                            const Icon = method.icon;
                                            const isSelected = newPayment.payment_method === method.value;
                                            return (
                                                <button
                                                    type="button"
                                                    key={method.value}
                                                    onClick={() => setNewPayment({ ...newPayment, payment_method: method.value })}
                                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${isSelected
                                                        ? 'bg-emerald-500/10 border-emerald-500/40 scale-105 shadow-lg shadow-emerald-500/10'
                                                        : 'bg-white/5 border-variable hover:bg-white/10'
                                                        }`}
                                                >
                                                    <Icon size={18} className={isSelected ? 'text-emerald-500' : 'text-variable-muted'} />
                                                    <span className={`text-[8px] font-black uppercase tracking-wider ${isSelected ? 'text-emerald-500' : 'text-variable-muted'}`}>{method.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Notas (opcional)</label>
                                    <textarea
                                        value={newPayment.notes}
                                        onChange={e => setNewPayment({ ...newPayment, notes: e.target.value })}
                                        className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-emerald-500/50 text-sm resize-none"
                                        rows={2}
                                        placeholder="Ej: Pago parcial primer mes..."
                                    />
                                </div>
                                {/* Preview */}
                                {newPayment.amount && parseFloat(newPayment.amount) > 0 && (
                                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-sm space-y-2">
                                        <div className="flex justify-between text-variable-muted">
                                            <span>Importe del cobro:</span>
                                            <span className="font-bold text-emerald-500">€{parseFloat(newPayment.amount).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-variable-muted">
                                            <span>Ya cobrado anteriormente:</span>
                                            <span className="font-bold text-variable-main">€{totalPaid.toFixed(2)}</span>
                                        </div>
                                        <div className={`flex justify-between font-black pt-2 border-t border-emerald-500/20 ${(pendingBalance - parseFloat(newPayment.amount)) <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            <span>{(pendingBalance - parseFloat(newPayment.amount)) <= 0 ? '✓ Pagado Completo' : 'Quedará pendiente:'}</span>
                                            <span>€{Math.max(0, pendingBalance - parseFloat(newPayment.amount)).toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Registrando...' : 'Registrar Cobro'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

