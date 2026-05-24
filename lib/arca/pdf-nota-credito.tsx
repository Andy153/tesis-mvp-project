import React from 'react'
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import QRCode from 'qrcode'
import {
  formatNumeroComprobante,
  formatFechaArca,
  formatMonto,
} from './pdf-factura'

/**
 * QR fiscal para Nota de Crédito C.
 * Diferencia clave vs factura: tipoCmp = 13 (NC C) en vez de 11.
 * Si esto se ignora, el QR se vuelve inválido fiscalmente.
 */
function buildQrFiscalUrlNC(params: {
  fechaEmision: string
  cuitEmisor: number
  ptoVta: number
  nroCmp: number
  importe: number
  tipoDocRec: number
  nroDocRec: number
  cae: string
}): string {
  const s = String(params.fechaEmision).replace(/\D/g, '').padStart(8, '0').slice(0, 8)
  const fechaIso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`

  const payload = {
    ver: 1,
    fecha: fechaIso,
    cuit: params.cuitEmisor,
    ptoVta: params.ptoVta,
    tipoCmp: 13, // Nota de Crédito C
    nroCmp: params.nroCmp,
    importe: params.importe,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: params.tipoDocRec,
    nroDocRec: params.nroDocRec,
    tipoCodAut: 'E',
    codAut: Number(String(params.cae).replace(/\D/g, '')),
  }
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64')
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
    padding: 28,
  },
  headerRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
  },
  headerCol: {
    flex: 1,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  headerColLast: {
    flex: 1,
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerLine: {
    fontSize: 9,
    marginBottom: 2,
    color: '#333',
  },
  letterBox: {
    borderWidth: 1,
    borderColor: '#000',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  letterC: {
    fontSize: 48,
    fontWeight: 'bold',
    lineHeight: 1,
  },
  codLabel: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  receptorBox: {
    borderWidth: 1,
    borderColor: '#000',
    borderTopWidth: 0,
    padding: 8,
  },
  receptorLine: {
    marginBottom: 3,
    color: '#333',
  },
  comprobanteAsociadoBox: {
    borderWidth: 1,
    borderColor: '#000',
    borderTopWidth: 0,
    padding: 8,
    backgroundColor: '#F5F5F5',
  },
  comprobanteAsociadoTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: '#000',
    borderTopWidth: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#DDD',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  tableRow: {
    flexDirection: 'row',
    minHeight: 22,
  },
  cell: {
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#000',
    fontSize: 8,
  },
  cellLast: {
    padding: 4,
    fontSize: 8,
  },
  colCodigo: { width: '8%' },
  colProducto: { width: '34%' },
  colCantidad: { width: '10%', textAlign: 'right' },
  colUnidad: { width: '10%' },
  colPrecio: { width: '14%', textAlign: 'right' },
  colBonif: { width: '10%', textAlign: 'right' },
  colSubtotal: { width: '14%', textAlign: 'right' },
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  totalsBox: {
    width: '42%',
    borderWidth: 1,
    borderColor: '#000',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  totalRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 6,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    alignItems: 'center',
  },
  qrImage: {
    width: 88,
    height: 88,
    marginRight: 16,
  },
  footerText: {
    fontSize: 9,
    marginBottom: 4,
    color: '#333',
  },
  footerTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
  },
})

export type NotaCreditoCPdfData = {
  emisor: {
    razonSocial: string
    cuit: string
    condicionIVA: string
    domicilio: string
    puntoVenta: number
    ingresosBrutos?: string
    fechaInicioActividades?: string
  }
  receptor: {
    cuit: string
    razonSocial: string
    condicionIVA: string
    condicionVenta?: string
  }
  /** Datos de la factura original que esta NC anula. */
  comprobanteAsociado: {
    /** Tipo ARCA del original. Para NC C va a ser siempre 11 (Factura C). */
    tipo: number
    puntoVenta: number
    numero: number
    fechaEmision: string
    cae: string
  }
  notaCredito: {
    numero: number
    fechaEmision: string
    periodoDesde: string
    periodoHasta: string
    descripcion: string
    monto: number
    cae: string
    caeVencimiento: string
    tipoDocRec: number
    nroDocRec: number
    motivo?: string | null
  }
}

function tipoComprobanteLabel(tipo: number): string {
  switch (tipo) {
    case 11:
      return 'Factura C'
    case 6:
      return 'Factura B'
    case 1:
      return 'Factura A'
    default:
      return `Comprobante tipo ${tipo}`
  }
}

function NotaCreditoCDocument({
  data,
  qrDataUrl,
}: {
  data: NotaCreditoCPdfData
  qrDataUrl: string
}) {
  const numeroFmt = formatNumeroComprobante(data.emisor.puntoVenta, data.notaCredito.numero)
  const fechaEmision = formatFechaArca(data.notaCredito.fechaEmision)
  const periodoDesde = formatFechaArca(data.notaCredito.periodoDesde)
  const periodoHasta = formatFechaArca(data.notaCredito.periodoHasta)
  const caeVto = formatFechaArca(data.notaCredito.caeVencimiento)
  const montoFmt = formatMonto(data.notaCredito.monto)
  const condicionVenta = data.receptor.condicionVenta ?? 'Contado'

  const asociadoNumeroFmt = formatNumeroComprobante(
    data.comprobanteAsociado.puntoVenta,
    data.comprobanteAsociado.numero,
  )
  const asociadoFechaFmt = formatFechaArca(data.comprobanteAsociado.fechaEmision)
  const asociadoTipoLabel = tipoComprobanteLabel(data.comprobanteAsociado.tipo)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header tripartito: emisor / título y letra / numeración */}
        <View style={styles.headerRow}>
          <View style={styles.headerCol}>
            <Text style={styles.headerTitle}>{data.emisor.razonSocial}</Text>
            <Text style={styles.headerLine}>CUIT: {data.emisor.cuit}</Text>
            <Text style={styles.headerLine}>{data.emisor.condicionIVA}</Text>
            <Text style={styles.headerLine}>{data.emisor.domicilio}</Text>
            <Text style={styles.headerLine}>Punto de Venta: {data.emisor.puntoVenta}</Text>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>NOTA DE CRÉDITO</Text>
            <View style={styles.letterBox}>
              <Text style={styles.letterC}>C</Text>
            </View>
            <Text style={styles.codLabel}>COD. 013</Text>
          </View>

          <View style={styles.headerColLast}>
            <Text style={styles.headerTitle}>Nota de Crédito C</Text>
            <Text style={styles.headerLine}>N° {numeroFmt}</Text>
            <Text style={styles.headerLine}>Fecha de Emisión: {fechaEmision}</Text>
            <Text style={styles.headerLine}>CUIT: {data.emisor.cuit}</Text>
            {data.emisor.ingresosBrutos ? (
              <Text style={styles.headerLine}>Ingresos Brutos: {data.emisor.ingresosBrutos}</Text>
            ) : null}
            {data.emisor.fechaInicioActividades ? (
              <Text style={styles.headerLine}>
                Inicio de Actividades: {data.emisor.fechaInicioActividades}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Datos del receptor */}
        <View style={styles.receptorBox}>
          <Text style={styles.receptorLine}>
            Período facturado desde: {periodoDesde} hasta: {periodoHasta}
          </Text>
          <Text style={styles.receptorLine}>CUIT/DNI: {data.receptor.cuit || '0'}</Text>
          <Text style={styles.receptorLine}>Razón Social: {data.receptor.razonSocial}</Text>
          <Text style={styles.receptorLine}>
            Condición frente al IVA: {data.receptor.condicionIVA}
          </Text>
          <Text style={styles.receptorLine}>Condición de venta: {condicionVenta}</Text>
        </View>

        {/* Bloque exclusivo de NC: comprobante asociado */}
        <View style={styles.comprobanteAsociadoBox}>
          <Text style={styles.comprobanteAsociadoTitle}>Comprobante Asociado</Text>
          <Text style={styles.receptorLine}>
            {asociadoTipoLabel} N° {asociadoNumeroFmt}
          </Text>
          <Text style={styles.receptorLine}>Fecha: {asociadoFechaFmt}</Text>
          <Text style={styles.receptorLine}>CAE: {data.comprobanteAsociado.cae}</Text>
          {data.notaCredito.motivo ? (
            <Text style={styles.receptorLine}>Motivo: {data.notaCredito.motivo}</Text>
          ) : null}
        </View>

        {/* Detalle */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.colCodigo]}>Código</Text>
            <Text style={[styles.cell, styles.colProducto]}>Producto / Servicio</Text>
            <Text style={[styles.cell, styles.colCantidad]}>Cantidad</Text>
            <Text style={[styles.cell, styles.colUnidad]}>U. Medida</Text>
            <Text style={[styles.cell, styles.colPrecio]}>Precio Unit.</Text>
            <Text style={[styles.cell, styles.colBonif]}>% Bonif</Text>
            <Text style={[styles.cellLast, styles.colSubtotal]}>Subtotal</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.cell, styles.colCodigo]}>001</Text>
            <Text style={[styles.cell, styles.colProducto]}>{data.notaCredito.descripcion}</Text>
            <Text style={[styles.cell, styles.colCantidad]}>1</Text>
            <Text style={[styles.cell, styles.colUnidad]}>unidades</Text>
            <Text style={[styles.cell, styles.colPrecio]}>{montoFmt}</Text>
            <Text style={[styles.cell, styles.colBonif]}>0,00</Text>
            <Text style={[styles.cellLast, styles.colSubtotal]}>{montoFmt}</Text>
          </View>
        </View>

        {/* Totales */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text>Subtotal:</Text>
              <Text>{montoFmt}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>Importe Otros Tributos:</Text>
              <Text>$0,00</Text>
            </View>
            <View style={styles.totalRowLast}>
              <Text>Importe Total Acreditado:</Text>
              <Text>{montoFmt}</Text>
            </View>
          </View>
        </View>

        {/* QR + CAE */}
        <View style={styles.footer}>
          <Image style={styles.qrImage} src={qrDataUrl} />
          <View>
            <Text style={styles.footerTitle}>Comprobante Autorizado</Text>
            <Text style={styles.footerText}>CAE N°: {data.notaCredito.cae}</Text>
            <Text style={styles.footerText}>Fecha de Vto. de CAE: {caeVto}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function generarPDFNotaCreditoC(data: NotaCreditoCPdfData): Promise<Buffer> {
  const qrUrl = buildQrFiscalUrlNC({
    fechaEmision: data.notaCredito.fechaEmision,
    cuitEmisor: parseInt(data.emisor.cuit.replace(/\D/g, ''), 10),
    ptoVta: data.emisor.puntoVenta,
    nroCmp: data.notaCredito.numero,
    importe: data.notaCredito.monto,
    tipoDocRec: data.notaCredito.tipoDocRec,
    nroDocRec: data.notaCredito.nroDocRec,
    cae: data.notaCredito.cae,
  })

  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 120 })
  const buffer = await renderToBuffer(
    <NotaCreditoCDocument data={data} qrDataUrl={qrDataUrl} />,
  )
  return Buffer.from(buffer)
}
