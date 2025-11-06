// js/state.js

// Estado mutable de la aplicación
let state = {
    allServices: {},
    monthlyPlans: [],
    localServices: [], // NUEVO: para servicios creados por IA
    selectedServices: [],
    customServices: [], // Para ítems manuales temporales en una propuesta
    tasks: [],
    editingIndex: -1,
    totalPlanPoints: 0,
    usedPlanPoints: 0,
    selectedPlanId: null,
    selectedPlanServices: [],
    isTieredBuilderActive: false,
    currentCurrency: 'USD',
    usdToArsRate: null,
    pointPrice: 0, // NUEVO: Costo por punto extra
    extraPointsPurchased: 0, // NUEVO: Cantidad de puntos extra comprados
    extraPointsCost: 0, // NUEVO: Costo total de los puntos extra
    sessionApiKey: null, // API key ahora se gestiona aquí
    isGuidedModeActive: true, // NUEVO: Para el modo guiado
};

// --- HELPERS ---
export const formatPrice = (usdAmount) => {
    if (state.currentCurrency === 'ARS' && state.usdToArsRate) {
        const arsAmount = usdAmount * state.usdToArsRate;
        return `$${arsAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS`;
    }
    return `$${usdAmount.toFixed(2)} USD`;
};


// Funciones para obtener y modificar el estado de forma controlada
export const getState = () => state;

export const setAllServices = (services) => { state.allServices = services; };
export const setMonthlyPlans = (plans) => { state.monthlyPlans = plans; };
export const setLocalServices = (services) => { state.localServices = services; };
export const setSelectedServices = (services) => { state.selectedServices = services; };
export const setCustomServices = (services) => { state.customServices = services; };
export const setTasks = (tasks) => { state.tasks = tasks; };
export const setEditingIndex = (index) => { state.editingIndex = index; };
export const setTotalPlanPoints = (points) => { state.totalPlanPoints = points; };
export const setUsedPlanPoints = (points) => { state.usedPlanPoints = points; };
export const setSelectedPlanId = (id) => { state.selectedPlanId = id; };
export const setSelectedPlanServices = (services) => { state.selectedPlanServices = services; };
export const setTieredBuilderActive = (isActive) => { state.isTieredBuilderActive = isActive; };
export const setCurrentCurrency = (currency) => { state.currentCurrency = currency; };
export const setUsdToArsRate = (rate) => { state.usdToArsRate = rate; };
export const setPointPrice = (price) => { state.pointPrice = price; };
export const setExtraPointsPurchased = (points) => { state.extraPointsPurchased = points; };
export const setExtraPointsCost = (cost) => { state.extraPointsCost = cost; };
export const setSessionApiKey = (key) => { state.sessionApiKey = key; };
export const getSessionApiKey = () => state.sessionApiKey;
export const setIsGuidedModeActive = (isActive) => { state.isGuidedModeActive = isActive; };