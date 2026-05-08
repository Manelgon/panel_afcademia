// Constantes Fundae compartidas entre el form público y los modales de admin.

// Niveles de estudios estándar Fundae
export const NIVELES_ESTUDIOS = [
    { value: 'sin_estudios', label: 'Sin estudios' },
    { value: 'primarios_incompletos', label: 'Estudios primarios incompletos' },
    { value: 'primarios_egb', label: 'Estudios primarios / EGB' },
    { value: 'graduado_eso', label: 'Graduado escolar / ESO' },
    { value: 'bachillerato_bup', label: 'Bachillerato / BUP / COU' },
    { value: 'fp_medio', label: 'FP Grado Medio' },
    { value: 'fp_superior', label: 'FP Grado Superior' },
    { value: 'diplomatura_grado', label: 'Diplomatura / Grado universitario' },
    { value: 'licenciatura_master', label: 'Licenciatura / Máster' },
    { value: 'doctorado', label: 'Doctorado' },
    { value: 'otros', label: 'Otros' }
];

// Categorías profesionales estándar Fundae
export const CATEGORIAS_PROFESIONALES = [
    { value: 'directivo', label: 'Directivo' },
    { value: 'mando_intermedio', label: 'Mando intermedio' },
    { value: 'tecnico', label: 'Técnico' },
    { value: 'trabajador_cualificado', label: 'Trabajador cualificado' },
    { value: 'trabajador_no_cualificado', label: 'Trabajador semicualificado / no cualificado' }
];

// Helpers para mapear value <-> label en ambos sentidos.
// El form público y modales guardan el LABEL legible en BD para que el admin lo vea sin lookup.
// Al cargar drafts/fichas existentes, mapeamos el label/value a value para que el dropdown lo seleccione.

export const labelToValue = (list, val) => {
    if (!val) return '';
    return list.find(o => o.label === val || o.value === val)?.value || '';
};

export const valueToLabel = (list, val) => {
    if (!val) return '';
    return list.find(o => o.value === val)?.label || val;
};
