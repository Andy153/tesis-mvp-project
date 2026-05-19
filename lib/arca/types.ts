export interface EmitirFacturaCInput {
  cuitReceptor: string;
  importeTotal: number;
  periodoDesde: string;
  periodoHasta: string;
}

export interface FacturaCResult {
  exito: boolean;
  nroComprobante?: number;
  cae?: string;
  caeFechaVto?: string;
  errores?: string[];
  pdfPath?: string | null;
  pdfUrl?: string | null;
}
