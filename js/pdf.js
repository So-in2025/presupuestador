// js/pdf.js

import * as dom from './dom.js';
import { getState } from './state.js';
import { showNotification, closePdfOptionsModal } from './modals.js';

export async function generatePdf(isForClient, button) {
    const spinner = button.querySelector('.spinner');
    const btnText = button.querySelector('.btn-text');
    const originalText = btnText.textContent;

    spinner.classList.remove('hidden');
    btnText.textContent = 'Generando...';
    button.disabled = true;

    try {
        const { tasks, allServices, monthlyPlans, currentCurrency, usdToArsRate } = getState();
        
        // OBTENER DATOS DE MARCA DIRECTAMENTE DEL LOCALSTORAGE
        const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
        const accentColor = brandInfo.color || '#22D3EE';
        
        // Colores de alto contraste para el PDF
        const textPrimaryColor = '#0F172A'; // Slate 900
        const textSecondaryColor = '#334155'; // Slate 700
        const textMutedColor = '#64748B'; // Slate 500

        // El logo ahora se obtiene siempre del almacenamiento, no del input del modal.
        const logoDataUrl = brandInfo.logo || null;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'px', format: 'a4' });
        let y = 30;
        const pageHeight = doc.internal.pageSize.height;
        const leftMargin = 30;
        const rightMargin = doc.internal.pageSize.width - 30;
        const contentWidth = rightMargin - leftMargin;

        // --- HELPERS ---
        const formatPdfPrice = (usdAmount) => {
            if (currentCurrency === 'ARS' && usdToArsRate) {
                const arsAmount = usdAmount * usdToArsRate;
                return `$${arsAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS`;
            }
            return `$${usdAmount.toFixed(2)} USD`;
        };
        const addPageNumbers = () => {
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(textMutedColor);
                doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width / 2, pageHeight - 15, { align: 'center' });
            }
        };
        
        const checkPageBreak = (spaceNeeded = 20) => {
            if (y + spaceNeeded > pageHeight - 30) {
                doc.addPage();
                y = 30;
            }
        };

        const findServiceById = (id) => {
            for (const categoryKey in allServices) {
                const service = allServices[categoryKey].items.find(item => item.id === id);
                if (service) return service;
            }
            const local = getState().localServices.find(s => s.id === id);
            if (local) return local;
            const custom = getState().customServices.find(s => s.id === id);
            if (custom) return custom;
            return { name: `Servicio (ID: ${id})`, description: 'Descripción no encontrada.', price: 0 };
        };

        // =================================================================
        // --- VERSIÓN 1: PROPUESTA PARA EL CLIENTE FINAL ---
        // =================================================================
        if (isForClient) {
            if (logoDataUrl) {
                try { doc.addImage(logoDataUrl, 'PNG', leftMargin, y-10, 60, 30, undefined, 'FAST'); }
                catch (e) { console.error("Error al añadir logo:", e); }
            }
            // OBTENER INFO DEL REVENDEDOR DESDE LOCALSTORAGE
            const resellerInfo = (brandInfo.resellerInfo || 'Datos no configurados').split('\n');
            doc.setFontSize(9);
            doc.setTextColor(textSecondaryColor);
            doc.text(resellerInfo, rightMargin, y, { align: 'right' });
            
            y += 40;
            // OBTENER INFO DEL CLIENTE DESDE EL MODAL
            const clientInfo = dom.pdfClientInfo.value.split('\n');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(textPrimaryColor);
            doc.text("Presupuesto Para:", leftMargin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(textSecondaryColor);
            doc.text(clientInfo, leftMargin, y + 10);
            
            const date = new Date().toLocaleDateString('es-ES');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(textPrimaryColor);
            doc.text("Fecha de Emisión:", rightMargin, y, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(textSecondaryColor);
            doc.text(date, rightMargin, y + 10, { align: 'right' });
            
            y += 40;
            doc.setDrawColor('#E2E8F0'); // Slate 200
            doc.line(leftMargin, y, rightMargin, y);
            y += 20;
            
            tasks.forEach((task, index) => {
                if (task.isTiered) {
                    checkPageBreak(200);
                    doc.setFontSize(16);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(accentColor);
                    doc.text(`Propuesta para: ${task.webName}`, doc.internal.pageSize.width / 2, y, { align: 'center' });
                    y += 30;

                    const colWidth = contentWidth / 3;
                    const startX = leftMargin;
                    
                    task.tiers.forEach((tier, i) => {
                        const x = startX + (i * colWidth);
                        doc.setFontSize(12);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(textPrimaryColor);
                        doc.text(tier.name, x + colWidth / 2, y, { align: 'center', maxWidth: colWidth - 10 });
                    });
                    y += 20;
                    
                    const allTierServices = [...new Set(task.tiers.flatMap(t => t.services.map(s => s.id)))].map(id => findServiceById(id));
                    
                    doc.setFontSize(9);
                    doc.setDrawColor('#E2E8F0');
                    allTierServices.forEach(service => {
                        checkPageBreak(30);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(textSecondaryColor);
                        doc.text(service.name, leftMargin, y, {maxWidth: colWidth - 20});
                        
                        task.tiers.forEach((tier, i) => {
                            const x = startX + (i * colWidth);
                            const hasService = tier.services.some(s => s.id === service.id);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(hasService ? '#16A34A' : '#DC2626'); // Green 600, Red 600
                            doc.text(hasService ? '✓' : '—', x + colWidth / 2, y, { align: 'center' });
                        });
                        y += 15;
                        doc.line(leftMargin, y - 7, rightMargin, y-7);
                    });
                    
                     y += 10;
                    task.tiers.forEach((tier, i) => {
                        const x = startX + (i * colWidth);
                        const clientPrice = task.margin < 1 ? tier.totalDev / (1 - task.margin) : tier.totalDev * (1 + task.margin);
                        doc.setFontSize(14);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(accentColor);
                        doc.text(formatPdfPrice(clientPrice), x + colWidth / 2, y, { align: 'center' });
                    });
                    y += 30;

                } else {
                    checkPageBreak(80);
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(accentColor);
                    doc.text(`Proyecto: ${task.webName}`, leftMargin, y);
                    y += 12;

                    const item = task.package ? findServiceById(task.package.id) : (task.plan ? monthlyPlans.find(p => p.id == task.plan.id) : null);
                    if (item) {
                        doc.setFontSize(11);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(textPrimaryColor);
                        doc.text(item.name, leftMargin, y);
                        y += 10;
                        doc.setFontSize(9);
                        doc.setTextColor(textMutedColor);
                        const descriptionLines = doc.splitTextToSize(item.description, contentWidth);
                        doc.text(descriptionLines, leftMargin, y);
                        y += descriptionLines.length * 8 + 8;
                    } else {
                        doc.setFontSize(11);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(textPrimaryColor);
                        doc.text("Desglose de Servicios:", leftMargin, y);
                        y += 12;
                        doc.setFontSize(10);
                        task.services.forEach(svc => {
                            checkPageBreak();
                            doc.setTextColor(textSecondaryColor);
                            doc.text(`• ${svc.name}`, leftMargin + 4, y);
                            y += 10;
                        });
                        y += 4;
                    }
                    
                    checkPageBreak(30);
                    doc.setDrawColor('#E2E8F0');
                    doc.line(leftMargin + 160, y, rightMargin, y);
                    y += 10;
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor('#16A34A');
                    doc.text("Monto Total:", rightMargin - 80, y, { align: 'right' });
                    doc.text(formatPdfPrice(task.totalClient), rightMargin, y, { align: 'right' });
                    y += 40;
                }

                if (index < tasks.length - 1) {
                    doc.setDrawColor('#E2E8F0');
                    doc.line(leftMargin, y - 10, rightMargin, y - 10);
                }
            });
            
            // OBTENER TÉRMINOS DESDE LOCALSTORAGE
            const terms = brandInfo.terms;
            if(terms){
                checkPageBreak(80);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(textPrimaryColor);
                doc.text("Términos y Condiciones", leftMargin, y);
                y += 10;
                doc.setFontSize(8);
                doc.setTextColor(textMutedColor);
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
        // --- VERSIÓN 2: ORDEN DE TRABAJO INTERNA (PARA SO->IN) ---
        // ====================================================================
        
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(accentColor);
        doc.text("Orden de Trabajo Interna (SO->IN)", doc.internal.pageSize.width / 2, y, { align: 'center' });
        y += 12;
        doc.setFontSize(10);
        doc.setTextColor(textMutedColor);
        doc.text(`Fecha de Generación: ${new Date().toLocaleString('es-ES')}`, doc.internal.pageSize.width / 2, y, { align: 'center' });
        
        y += 20;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textPrimaryColor);
        doc.text("Generado por (Revendedor):", leftMargin, y);
        y += 10;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textSecondaryColor);
        // OBTENER INFO DEL REVENDEDOR DESDE LOCALSTORAGE
        const resellerInfo = (brandInfo.resellerInfo || 'Datos no configurados').split('\n');
        doc.text(resellerInfo, leftMargin, y);
        y += resellerInfo.length * 10 + 10;

        tasks.forEach((task) => {
            checkPageBreak(100);
            y += 20;
            doc.setDrawColor('#E2E8F0');
            doc.line(leftMargin, y, rightMargin, y);
            y += 15;
            
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(textPrimaryColor);
            doc.text(`Proyecto: ${task.webName}`, leftMargin, y);
            y += 15;
            doc.setFontSize(10);
            doc.setTextColor(textSecondaryColor);
            doc.text(`Cliente Final: ${task.clientName}`, leftMargin, y);
            y += 20;

            // Resumen Financiero
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(textPrimaryColor);
            doc.text("Resumen Financiero:", leftMargin, y);
            y += 12;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(textSecondaryColor);
            const cost = task.isTiered ? task.tiers.reduce((sum, t) => sum + t.totalDev, 0) : task.totalDev;
            const price = task.isTiered ? 'N/A (Ver desglose)' : task.totalClient;
            const profit = task.isTiered ? 'N/A' : price - cost;
            doc.text(`- Costo de Producción (para SO->IN):`, leftMargin + 5, y);
            doc.text(formatPdfPrice(cost), rightMargin, y, { align: 'right' });
            y += 10;
            doc.text(`- Precio Final (para Cliente):`, leftMargin + 5, y);
            doc.text(task.isTiered ? 'N/A' : formatPdfPrice(price), rightMargin, y, { align: 'right' });
            y += 10;
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#16A34A');
            doc.text(`- Margen de Ganancia (Revendedor):`, leftMargin + 5, y);
            doc.text(task.isTiered ? 'N/A' : formatPdfPrice(profit), rightMargin, y, { align: 'right' });
            y += 20;

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(textPrimaryColor);
            doc.text("Desglose Técnico para Desarrollo:", leftMargin, y);
            y += 12;

            const renderServiceDetails = (service) => {
                const serviceDetails = findServiceById(service.id);
                checkPageBreak(30);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(textSecondaryColor);
                doc.text(`• ${serviceDetails.name}`, leftMargin + 5, y);
                y += 10;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(textMutedColor);
                const descLines = doc.splitTextToSize(serviceDetails.description, contentWidth - 10);
                doc.text(descLines, leftMargin + 10, y);
                y += descLines.length * 8 + 5;
            };

            if (task.isTiered) {
                 task.tiers.forEach(tier => {
                     checkPageBreak(30);
                     doc.setFontSize(10);
                     doc.setFont('helvetica', 'bold');
                     doc.setTextColor(textPrimaryColor);
                     doc.text(`NIVEL: ${tier.name} (Costo: ${formatPdfPrice(tier.totalDev)})`, leftMargin + 5, y);
                     y += 12;
                     tier.services.forEach(renderServiceDetails);
                 });
            } else if (task.package) {
                renderServiceDetails(task.package);
            } else if (task.plan) {
                const planDetails = monthlyPlans.find(p => p.id == task.plan.id);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(textPrimaryColor);
                doc.text(`PLAN MENSUAL: ${planDetails.name}`, leftMargin + 5, y);
                y += 12;
                (task.plan.selectedServiceIds || []).forEach(id => renderServiceDetails({id}));
            } else {
                task.services.forEach(renderServiceDetails);
            }
        });

        addPageNumbers();
        const fileName = `Orden-Trabajo-${tasks[0]?.webName || 'Proyecto'}.pdf`;
        doc.save(fileName);
        showNotification('success', 'PDF Generado', `La orden de trabajo '${fileName}' ha sido exportada.`);
        closePdfOptionsModal();

    } catch (err) {
        console.error("Error al generar PDF:", err);
        showNotification('error', 'Error de PDF', 'No se pudo generar el documento. Revisa la consola para más detalles.');
    } finally {
        spinner.classList.add('hidden');
        btnText.textContent = originalText;
        button.disabled = false;
    }
}