export const TRAZA_PREPAGAS = [
  'Swiss Medical',
  'OSDE',
  'Galeno',
  'Medicus',
  'Medifé',
];

export const TRAZA_SANATORIOS = [
  'Otamendi',
  'Mater Dei',
  'Los Arcos',
  'Suizo Argentino',
  'Finochietto',
  'Clínica Santa Isabel',
  'Instituto Argentino de Diagnóstico',
  'Clínica Bazterrica',
];

export const TRAZA_REQUIRED_FIELDS: Array<{
  key: string;
  labels: string[];
  severity: 'error' | 'warn';
}> = [
  { key: 'prepaga', labels: ['prepaga', 'obra social', 'convenio', 'financiador', 'cobertura'], severity: 'error' },
  { key: 'fecha', labels: ['fecha'], severity: 'error' },
  { key: 'procedimiento', labels: ['procedimiento', 'práctica', 'intervención', 'cirugía', 'operación'], severity: 'error' },
  { key: 'codigo', labels: ['código', 'codigo nomenclador', 'nomenclador', 'cod. nomenclador'], severity: 'error' },
  { key: 'sanatorio', labels: ['sanatorio', 'clínica', 'institución', 'centro asistencial'], severity: 'warn' },
  { key: 'anestesia', labels: ['anestesia', 'tipo de anestesia'], severity: 'warn' },
];
