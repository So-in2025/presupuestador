// js/state.js

export const COMBO_DISCOUNT = 0.10;

// Estado mutable de la aplicación
let state = {
    allServices: {},
    monthlyPlans: [],
    selectedServices: [],
    customServices: [],
    tasks: [],
    editingIndex: -1,
    totalPlanPoints: 0,
    usedPlanPoints: 0,
    selectedPlanId: null,
    selectedPlanServices: []
};

// Funciones para obtener y modificar el estado de forma controlada
export const getState = () => state;

export const setAllServices = (services) => { state.allServices = services; };
export const setMonthlyPlans = (plans) => { state.monthlyPlans = plans; };
export const setSelectedServices = (services) => { state.selectedServices = services; };
export const setCustomServices = (services) => { state.customServices = services; };
export const setTasks = (tasks) => { state.tasks = tasks; };
export const setEditingIndex = (index) => { state.editingIndex = index; };
export const setTotalPlanPoints = (points) => { state.totalPlanPoints = points; };
export const setUsedPlanPoints = (points) => { state.usedPlanPoints = points; };
export const setSelectedPlanId = (id) => { state.selectedPlanId = id; };
export const setSelectedPlanServices = (services) => { state.selectedPlanServices = services; };