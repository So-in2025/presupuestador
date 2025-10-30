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
        const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
        const accentColor = brandInfo.color || '#22D3EE';

        const logoFile = dom.pdfLogoInput.files[0];
        let logoDataUrl = null;

        if (logoFile) {
            logoDataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.readAsDataURL(logoFile);
            });
        } else {
            logoDataUrl = brandInfo.logo || null;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'px', format: 'a4' });
        let y = 30;
        const pageHeight = doc.internal.pageSize.height;
        const leftMargin = 20;
        const rightMargin = doc.internal.pageSize.width - 20;
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
                doc.setTextColor('#64748B');
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
            const resellerInfo = dom.pdfResellerInfo.value.split('\n');
            doc.setFontSize(9);
            doc.setTextColor('#94A3B8');
            doc.text(resellerInfo, rightMargin, y, { align: 'right' });
            
            y += 40;
            const clientInfo = dom.pdfClientInfo.value.split('\n');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#F8FAFC');
            doc.text("Presupuesto Para:", leftMargin, y);
            doc.setFont('helvetica', 'normal');
            doc.text(clientInfo, leftMargin, y + 10);
            
            const date = new Date().toLocaleDateString('es-ES');
            doc.setFont('helvetica', 'bold');
            doc.text("Fecha de Emisión:", rightMargin, y, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.text(date, rightMargin, y + 10, { align: 'right' });
            
            y += 40;
            doc.setDrawColor('#334155');
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
                        doc.setTextColor('#F8FAFC');
                        doc.text(tier.name, x + colWidth / 2, y, { align: 'center', maxWidth: colWidth - 10 });
                    });
                    y += 20;
                    
                    const allTierServices = [...new Set(task.tiers.flatMap(t => t.services.map(s => s.id)))].map(id => findServiceById(id));
                    
                    doc.setFontSize(9);
                    doc.setDrawColor('#334155');
                    allTierServices.forEach(service => {
                        checkPageBreak(30);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor('#CBD5E1');
                        doc.text(service.name, leftMargin, y, {maxWidth: colWidth - 20});
                        
                        task.tiers.forEach((tier, i) => {
                            const x = startX + (i * colWidth);
                            const hasService = tier.services.some(s => s.id === service.id);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(hasService ? '#4ADE80' : '#EF4444');
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
                        doc.setTextColor('#F8FAFC');
                        doc.text(item.name, leftMargin, y);
                        y += 10;
                        doc.setFontSize(9);
                        doc.setTextColor('#94A3B8');
                        const descriptionLines = doc.splitTextToSize(item.description, contentWidth);
                        doc.text(descriptionLines, leftMargin, y);
                        y += descriptionLines.length * 8 + 8;
                    } else {
                        doc.setFontSize(11);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor('#F8FAFC');
                        doc.text("Desglose de Servicios:", leftMargin, y);
                        y += 12;
                        doc.setFontSize(10);
                        task.services.forEach(svc => {
                            checkPageBreak();
                            doc.setTextColor('#CBD5E1');
                            doc.text(`• ${svc.name}`, leftMargin + 4, y);
                            y += 10;
                        });
                        y += 4;
                    }
                    
                    checkPageBreak(30);
                    doc.setDrawColor('#334155');
                    doc.line(leftMargin + 160, y, rightMargin, y);
                    y += 10;
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor('#4ADE80');
                    doc.text("Monto Total:", rightMargin - 80, y, { align: 'right' });
                    doc.text(formatPdfPrice(task.totalClient), rightMargin, y, { align: 'right' });
                    y += 40;
                }

                if (index < tasks.length - 1) {
                    doc.setDrawColor('#334155');
                    doc.line(leftMargin, y - 10, rightMargin, y - 10);
                }
            });
            
            const terms = dom.pdfTerms.value;
            if(terms){
                checkPageBreak(80);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#F8FAFC');
                doc.text("Términos y Condiciones", leftMargin, y);
                y += 10;
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
        // --- VERSIÓN 2: BRIEF DE DESARROLLO (PARA EQUIPO TÉCNICO) ---
        // ====================================================================
        
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(accentColor);
        doc.text("Brief de Desarrollo - Reporte Técnico", doc.internal.pageSize.width / 2, y, { align: 'center' });
        y += 12;
        doc.setFontSize(10);
        doc.setTextColor('#94A3B8');
        doc.text(`Fecha de Generación: ${new Date().toLocaleString('es-ES')}`, doc.internal.pageSize.width / 2, y, { align: 'center' });
        
        let grandTotalDev = tasks.reduce((sum, t) => {
            if (t.isTiered) return sum; // Ignorar tiered para el total general
            return sum + t.totalDev;
        }, 0);

        tasks.forEach((task, index) => {
            checkPageBreak(100);
            y += 30;
            doc.setDrawColor('#334155');
            doc.line(leftMargin, y, rightMargin, y);
            y += 20;
            
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#F8FAFC');
            doc.text(`Proyecto: ${task.webName} (Cliente: ${task.clientName})`, leftMargin, y);
            
            const taskTotalDev = task.isTiered ? task.tiers.reduce((sum, t) => sum + t.totalDev, 0) : task.totalDev;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#FBBF24');
            doc.text(`Costo Producción: ${formatPdfPrice(taskTotalDev)}`, rightMargin, y, { align: 'right' });
            y += 25;

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor('#A5B4FC');

            if (task.isTiered) {
                 doc.text('PROPUESTA POR NIVELES - DESGLOSE TÉCNICO:', leftMargin, y);
                 y += 15;
                 task.tiers.forEach(tier => {
                     checkPageBreak(30);
                     doc.setFontSize(11);
                     doc.setFont('helvetica', 'bold');
                     doc.setTextColor('#F8FAFC');
                     doc.text(`NIVEL: ${tier.name} (${formatPdfPrice(tier.totalDev)})`, leftMargin + 5, y);
                     y += 12;
                     if (tier.services.length === 0) {
                         doc.setFontSize(9); doc.setTextColor('#94A3B8');
                         doc.text('No hay servicios seleccionados para este nivel.', leftMargin + 10, y);
                         y += 10;
                     } else {
                         tier.services.forEach(svc => {
                             const serviceDetails = findServiceById(svc.id);
                             checkPageBreak(30);
                             doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor('#CBD5E1');
                             doc.text(`• ${serviceDetails.name} (${formatPdfPrice(serviceDetails.price)})`, leftMargin + 10, y);
                             y += 10;
                             doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor('#94A3B8');
                             const descLines = doc.splitTextToSize(serviceDetails.description, contentWidth - 15);
                             doc.text(descLines, leftMargin + 15, y);
                             y += descLines.length * 8 + 5;
                         });
                     }
                 });
            } else if (task.package) {
                 const pkg = findServiceById(task.package.id);
                 doc.text(`PAQUETE SELECCIONADO: ${pkg.name}`, leftMargin, y);
                 y += 15;
                 doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor('#94A3B8');
                 const descLines = doc.splitTextToSize(pkg.description, contentWidth);
                 doc.text(descLines, leftMargin, y);
                 y += descLines.length * 8 + 10;
            } else if (task.plan) {
                const planDetails = monthlyPlans.find(p => p.id == task.plan.id);
                doc.text(`PLAN MENSUAL: ${planDetails.name}`, leftMargin, y);
                y += 12;
                doc.setFontSize(10); doc.setTextColor('#F8FAFC');
                doc.text(`Puntos Asignados: ${task.plan.pointsUsed} / ${planDetails.points}`, leftMargin, y);
                y += 15;
                doc.setFontSize(11); doc.setFont('helvetica', 'bold');
                doc.text('Servicios a Desarrollar en el Plan:', leftMargin, y);
                y += 12;
                if (task.plan.selectedServiceIds.length === 0) {
                    doc.setFontSize(9); doc.setTextColor('#94A3B8');
                    doc.text('No hay servicios específicos seleccionados para este plan.', leftMargin + 5, y);
                    y += 10;
                } else {
                    task.plan.selectedServiceIds.forEach(serviceId => {
                        const serviceDetails = findServiceById(serviceId);
                        checkPageBreak(30);
                        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor('#CBD5E1');
                        doc.text(`• ${serviceDetails.name} (${serviceDetails.pointCost} Pts)`, leftMargin + 5, y);
                        y += 10;
                        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor('#94A3B8');
                        const descLines = doc.splitTextToSize(serviceDetails.description, contentWidth - 10);
                        doc.text(descLines, leftMargin + 10, y);
                        y += descLines.length * 8 + 5;
                    });
                }
            } else {
                doc.text('SERVICIOS INDIVIDUALES A DESARROLLAR:', leftMargin, y);
                y += 15;
                if (task.services.length === 0) {
                    doc.setFontSize(9); doc.setTextColor('#94A3B8');
                    doc.text('No hay servicios individuales seleccionados.', leftMargin + 5, y);
                    y += 10;
                } else {
                    task.services.forEach(svc => {
                        const serviceDetails = findServiceById(svc.id);
                        checkPageBreak(30);
                        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor('#CBD5E1');
                        doc.text(`• ${serviceDetails.name}`, leftMargin + 5, y);
                        y += 10;
                        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor('#94A3B8');
                        const descLines = doc.splitTextToSize(serviceDetails.description, contentWidth - 10);
                        doc.text(descLines, leftMargin + 10, y);
                        y += descLines.length * 8 + 5;
                    });
                }
            }
        });

        checkPageBreak(60);
        y+=20;
        doc.setDrawColor('#334155');
        doc.line(leftMargin, y, rightMargin, y);
        y += 20;
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#4ADE80');
        doc.text("COSTO PRODUCCIÓN TOTAL (PROYECTOS NO TIERED):", rightMargin, y, { align: 'right' });
        y += 20;
        doc.setFontSize(20);
        doc.text(formatPdfPrice(grandTotalDev), rightMargin, y, { align: 'right' });

        addPageNumbers();
        const fileName = `Brief-Desarrollo-${new Date().toISOString().slice(0,10)}.pdf`;
        doc.save(fileName);
        showNotification('success', 'PDF Generado', `El brief de desarrollo '${fileName}' ha sido exportado.`);
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

window.generatePdf = generatePdf;