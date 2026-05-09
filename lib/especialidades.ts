/** Lista corta para el alta de perfil médico; «Otros» abre texto libre. */
export const ESPECIALIDADES_MEDICO = [
  'Clínica médica',
  'Cardiología',
  'Cirugía general',
  'Dermatología',
  'Ginecología',
  'Tocoginecología',
  'Neurología',
  'Neumonología',
  'Oftalmología',
  'Otorrinolaringología',
  'Pediatría',
  'Psiquiatría',
  'Radiología',
  'Traumatología',
  'Urología',
  'Anestesiología',
  'Otros',
] as const

export type EspecialidadLista = (typeof ESPECIALIDADES_MEDICO)[number]

export function especialidadEnLista(v: string | null | undefined): v is EspecialidadLista {
  if (!v) return false
  return (ESPECIALIDADES_MEDICO as readonly string[]).includes(v)
}
