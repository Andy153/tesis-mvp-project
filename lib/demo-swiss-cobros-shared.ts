/** Constantes y helpers demo sin dependencias de servidor (seguros para componentes cliente). */

export const DEMO_CAE = '12345678901234';
export const DEMO_MONTO = '85000';
export const DEMO_PDF_URL = '#';

const DEMO_NUMERO_COMPROBANTE = 1;

function defaultCaeVencimiento(): string {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return d.toISOString().slice(0, 10);
}

export function buildDemoFacturaResponse() {
  const caeFechaVto = defaultCaeVencimiento();
  return {
    exito: true,
    ambiente: 'desarrollo' as const,
    receptor: {
      cuit: '30500000003',
      razonSocial: 'Swiss Medical S.A.',
    },
    nroComprobante: DEMO_NUMERO_COMPROBANTE,
    cae: DEMO_CAE,
    caeFechaVto,
    fechaEmision: new Date().toISOString().slice(0, 10),
    pdfPath: 'demo/factura.pdf',
    pdfUrl: DEMO_PDF_URL,
  };
}
