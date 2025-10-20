// js/pdf.js

import * as dom from './dom.js';
import { getState } from './state.js';
import { showNotification, closePdfOptionsModal } from './modals.js';

export async function generatePdf(isForClient) {
    const logoFile = dom.pdfLogoInput.files[0];
    const reader = new FileReader();
    const logoPromise = new Promise((resolve) => {
        if (logoFile) {
            reader.onload = (event) => resolve(event.target.result);
            reader.readAsDataURL(logoFile);
        } else {
            resolve(null);
        }
    });

    const logoDataUrl = await logoPromise;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const { tasks, allServices, monthlyPlans } = getState();
    let y = 20;
    const pageHeight = doc.internal.pageSize.height;
    const leftMargin = 15;
    const rightMargin = 195;
    const contentWidth = rightMargin - leftMargin;

    // --- HELPERS ---
    const addPageNumbers = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor('#64748B'); // Slate-500
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width / 2, pageHeight - 10, { align: 'center' });
        }
    };
    
    const checkPageBreak = (spaceNeeded = 10) => {
        if (y + spaceNeeded > pageHeight - 20) {
            doc.addPage();
            y = 20;
        }
    };

    const findServiceById = (id) => {
        for (const categoryKey in allServices) {
            const category = allServices[categoryKey];
            const service = category.items.find(item => item.id === id);
            if (service) return service;
        }
        return { name: `Servicio Desconocido (ID: ${id})`, description: 'No se encontró la descripción.', price: 0, pointCost: 0 };
    };

    // =================================================================
    // --- VERSIÓN 1: PROPUESTA PARA EL CLIENTE FINAL (SIMPLIFICADA) ---
    // =================================================================
    if (isForClient) {
        // --- ENCABEZADO ---
        if (logoDataUrl) {
            try { doc.addImage(logoDataUrl, 'PNG', leftMargin, y-5, 30, 15); }
            catch (e) { console.error("Error al añadir logo:", e); }
        }
        const resellerInfo = dom.pdfResellerInfo.value.split('\n');
        doc.setFontSize(9);
        doc.setTextColor('#94A3B8');
        doc.text(resellerInfo, rightMargin, y, { align: 'right' });
        
        y += 20;
        const clientInfo = dom.pdfClientInfo.value.split('\n');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#F8FAFC');
        doc.text("Presupuesto Para:", leftMargin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(clientInfo, leftMargin, y + 6);
        
        const date = new Date().toLocaleDateString('es-ES');
        doc.setFont('helvetica', 'bold');
        doc.text("Fecha de Emisión:", rightMargin, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.text(date, rightMargin, y + 6, { align: 'right' });
        
        y += 20;
        doc.setDrawColor('#334155');
        doc.line(leftMargin, y, rightMargin, y);
        y += 10;
        
        // --- CUERPO ---
        tasks.forEach((task, index) => {
            checkPageBreak(40);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#22D3EE'); // Cyan
            doc.text(`Proyecto: ${task.webName}`, leftMargin, y);
            y += 8;

            const item = task.package ? findServiceById(task.package.id) : (task.plan ? monthlyPlans.find(p => p.id == task.plan.id) : null);
            if (item) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#F8FAFC');
                doc.text(item.name, leftMargin, y);
                y += 6;
                doc.setFontSize(9);
                doc.setTextColor('#94A3B8');
                const descriptionLines = doc.splitTextToSize(item.description, contentWidth);
                doc.text(descriptionLines, leftMargin, y);
                y += descriptionLines.length * 4 + 4;
            } else {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#F8FAFC');
                doc.text("Desglose de Servicios:", leftMargin, y);
                y += 7;
                doc.setFontSize(10);
                task.services.forEach(svc => {
                    checkPageBreak();
                    doc.setTextColor('#CBD5E1');
                    doc.text(`• ${svc.name}`, leftMargin + 2, y);
                    y += 5;
                });
                y += 2;
            }
            
            checkPageBreak(15);
            doc.setDrawColor('#334155');
            doc.line(leftMargin + 80, y, rightMargin, y);
            y += 6;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#4ADE80'); // Green
            doc.text("Monto Total:", rightMargin - 40, y, { align: 'right' });
            doc.text(`$${task.totalClient.toFixed(2)} USD`, rightMargin, y, { align: 'right' });
            y += 20;

            if (index < tasks.length - 1) {
                doc.setDrawColor('#334155');
                doc.line(leftMargin, y - 5, rightMargin, y - 5);
            }
        });
        
        // --- PIE DE PÁGINA ---
        const terms = dom.pdfTerms.value;
        if(terms){
            checkPageBreak(40);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#F8FAFC');
            doc.text("Términos y Condiciones", leftMargin, y);
            y += 5;
            doc.setFontSize(8);
            doc.setTextColor('#94A3B8');
            const termsLines = doc.splitTextToSize(terms, contentWidth);
            doc.text(termsLines, leftMargin, y);
        }

        addPageNumbers();
        const fileName = `Propuesta-${tasks[0]?.webName || 'Proyecto'}.pdf`;
        doc.save(fileName);
        showNotification('success', 'PDF Generado', `El documento '${fileName}' ha sido exportado.`);
        closePdfOptionsModal();
        return;
    }

    // ====================================================================
    // --- VERSIÓN 2: REPORTE INTERNO PARA DESARROLLADOR (MEJORADO) ---
    // ====================================================================
    
    // --- ENCABEZADO DEL DOCUMENTO ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#22D3EE'); // Cyan
    doc.text("Reporte Interno de Desarrollo", doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor('#94A3B8');
    doc.text(`Fecha de Generación: ${new Date().toLocaleString('es-ES')}`, doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += 15;

    const resellerInfoText = (dom.pdfResellerInfo.value || 'No especificado').split('\n');
    const clientInfoText = (dom.pdfClientInfo.value || 'No especificado').split('\n');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#F8FAFC');
    doc.text("Preparado por (Revendedor):", leftMargin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(resellerInfoText, leftMargin, y + 6);
    
    doc.setFont('helvetica', 'bold');
    doc.text("Para el cliente final:", rightMargin, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(clientInfoText, rightMargin, y + 6, { align: 'right' });
    y += (Math.max(resellerInfoText.length, clientInfoText.length) * 5) + 10;
    
    // --- BUCLE PRINCIPAL DE TAREAS ---
    tasks.forEach((task, index) => {
        checkPageBreak(50);
        doc.setDrawColor('#334155');
        doc.line(leftMargin, y, rightMargin, y);
        y += 10;
        
        // --- TÍTULO DE LA TAREA ---
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#F8FAFC');
        doc.text(`Proyecto: ${task.webName}`, leftMargin, y);
        y += 6;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#FBBF24'); // Amber for cost
        doc.text(`Costo de Desarrollo: $${task.totalDev.toFixed(2)} USD`, rightMargin, y, { align: 'right' });
        y += 10;
        
        // --- DETALLES DE LA TAREA ---
        if (task.package) {
            const pkg = findServiceById(task.package.id);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#A5B4FC'); // Indigo Light
            doc.text('PAQUETE SELECCIONADO:', leftMargin, y);
            y += 7;
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#F8FAFC');
            doc.text(`• ${pkg.name}`, leftMargin + 2, y);
            y += 6;
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor('#94A3B8');
            const descLines = doc.splitTextToSize(pkg.description, contentWidth - 5);
            doc.text(descLines, leftMargin + 5, y);
            y += descLines.length * 4 + 5;

        } else if (task.plan) {
            const plan = monthlyPlans.find(p => p.id == task.plan.id);
            const totalUsedPoints = task.plan.selectedServiceIds.reduce((sum, sId) => sum + findServiceById(sId).pointCost, 0);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#A5B4FC');
            doc.text('PLAN MENSUAL:', leftMargin, y);
            doc.setFont('helvetica', 'normal');
            doc.text(`${plan.name} (${totalUsedPoints} / ${plan.points} Pts usados)`, leftMargin + 35, y);
            y += 8;
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#F8FAFC');
            doc.text('Servicios solicitados en este plan:', leftMargin, y);
            y += 7;
            
            task.plan.selectedServiceIds.forEach(serviceId => {
                const svc = findServiceById(serviceId);
                checkPageBreak(15 + (svc.description.length / 2));
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#CBD5E1');
                doc.text(`• ${svc.name} (${svc.pointCost} Pts)`, leftMargin + 2, y);
                y += 5;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor('#94A3B8');
                const descLines = doc.splitTextToSize(svc.description, contentWidth - 8);
                doc.text(descLines, leftMargin + 8, y);
                y += descLines.length * 4 + 4;
            });

        } else { // Ítems individuales
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#A5B4FC');
            doc.text('ÍTEMS INDIVIDUALES SOLICITADOS:', leftMargin, y);
            y += 8;

            task.services.forEach(svc => {
                const fullSvc = findServiceById(svc.id);
                checkPageBreak(15 + (fullSvc.description.length / 2));
                
                let serviceTitle = svc.type === 'custom' ? `⭐ ${svc.name} (Servicio Personalizado)` : `• ${svc.name}`;
                
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#CBD5E1');
                doc.text(serviceTitle, leftMargin + 2, y);
                doc.text(`$${svc.price.toFixed(2)}`, rightMargin, y, { align: 'right' });
                y += 5;
                
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor('#94A3B8');
                const desc = svc.type === 'custom' ? '(Sin descripción para ítems personalizados)' : fullSvc.description;
                const descLines = doc.splitTextToSize(desc, contentWidth - 8);
                doc.text(descLines, leftMargin + 8, y);
                y += descLines.length * 4 + 4;
            });
        }
        y += 10;
    });

    // --- PIE DE PÁGINA FINAL CON TOTALES ---
    checkPageBreak(30);
    doc.setDrawColor('#334155');
    doc.line(leftMargin, y, rightMargin, y);
    y += 10;

    const grandTotalDev = tasks.reduce((sum, t) => sum + t.totalDev, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#4ADE80'); // Green
    doc.text("COSTO TOTAL (TODOS LOS PROYECTOS):", rightMargin, y, { align: 'right' });
    y += 8;
    doc.setFontSize(20);
    doc.text(`$${grandTotalDev.toFixed(2)} USD`, rightMargin, y, { align: 'right' });

    addPageNumbers();
    const fileName = `ReporteInterno-${tasks[0]?.webName || 'Proyectos'}-${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(fileName);
    showNotification('success', 'PDF Generado', `El reporte interno '${fileName}' ha sido exportado.`);
    closePdfOptionsModal();
}

// Asociar al scope global para que el onclick del HTML funcione
window.generatePdf = generatePdf;