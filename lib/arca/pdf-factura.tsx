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

export function formatNumeroComprobante(ptoVta: number, nro: number): string {
  return `${String(ptoVta).padStart(4, '0')}-${String(nro).padStart(8, '0')}`
}

export function formatFechaArca(yyyymmdd: string | number): string {
  const s = String(yyyymmdd).replace(/\D/g, '').padStart(8, '0').slice(0, 8)
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
}

export function formatMonto(n: number): string {
  const rounded = Math.round(n * 100) / 100
  const [entero, dec] = rounded.toFixed(2).split('.')
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$${conMiles},${dec}`
}

function yyyymmddToIso(yyyymmdd: string): string {
  const s = String(yyyymmdd).replace(/\D/g, '').padStart(8, '0').slice(0, 8)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function buildQrFiscalUrl(params: {
  fechaEmision: string
  cuitEmisor: number
  ptoVta: number
  nroCmp: number
  importe: number
  tipoDocRec: number
  nroDocRec: number
  cae: string
}): string {
  const payload = {
    ver: 1,
    fecha: yyyymmddToIso(params.fechaEmision),
    cuit: params.cuitEmisor,
    ptoVta: params.ptoVta,
    tipoCmp: 11,
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
  borderBox: {
    borderWidth: 1,
    borderColor: '#000',
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

export type FacturaCPdfData = {
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
  factura: {
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
  }
}

function FacturaCDocument({
  data,
  qrDataUrl,
}: {
  data: FacturaCPdfData
  qrDataUrl: string
}) {
  const numeroFmt = formatNumeroComprobante(data.emisor.puntoVenta, data.factura.numero)
  const fechaEmision = formatFechaArca(data.factura.fechaEmision)
  const periodoDesde = formatFechaArca(data.factura.periodoDesde)
  const periodoHasta = formatFechaArca(data.factura.periodoHasta)
  const caeVto = formatFechaArca(data.factura.caeVencimiento)
  const montoFmt = formatMonto(data.factura.monto)
  const condicionVenta = data.receptor.condicionVenta ?? 'Contado'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerCol}>
            <Text style={styles.headerTitle}>{data.emisor.razonSocial}</Text>
            <Text style={styles.headerLine}>CUIT: {data.emisor.cuit}</Text>
            <Text style={styles.headerLine}>{data.emisor.condicionIVA}</Text>
            <Text style={styles.headerLine}>{data.emisor.domicilio}</Text>
            <Text style={styles.headerLine}>Punto de Venta: {data.emisor.puntoVenta}</Text>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>FACTURA</Text>
            <View style={styles.letterBox}>
              <Text style={styles.letterC}>C</Text>
            </View>
            <Text style={styles.codLabel}>COD. 011</Text>
          </View>

          <View style={styles.headerColLast}>
            <Text style={styles.headerTitle}>Factura C</Text>
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
            <Text style={[styles.cell, styles.colProducto]}>{data.factura.descripcion}</Text>
            <Text style={[styles.cell, styles.colCantidad]}>1</Text>
            <Text style={[styles.cell, styles.colUnidad]}>unidades</Text>
            <Text style={[styles.cell, styles.colPrecio]}>{montoFmt}</Text>
            <Text style={[styles.cell, styles.colBonif]}>0,00</Text>
            <Text style={[styles.cellLast, styles.colSubtotal]}>{montoFmt}</Text>
          </View>
        </View>

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
              <Text>Importe Total:</Text>
              <Text>{montoFmt}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Image style={styles.qrImage} src={qrDataUrl} />
          <View>
            <Text style={styles.footerTitle}>Comprobante Autorizado</Text>
            <Text style={styles.footerText}>CAE N°: {data.factura.cae}</Text>
            <Text style={styles.footerText}>Fecha de Vto. de CAE: {caeVto}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function generarPDFFacturaC(data: FacturaCPdfData): Promise<Buffer> {
  const qrUrl = buildQrFiscalUrl({
    fechaEmision: data.factura.fechaEmision,
    cuitEmisor: parseInt(data.emisor.cuit.replace(/\D/g, ''), 10),
    ptoVta: data.emisor.puntoVenta,
    nroCmp: data.factura.numero,
    importe: data.factura.monto,
    tipoDocRec: data.factura.tipoDocRec,
    nroDocRec: data.factura.nroDocRec,
    cae: data.factura.cae,
  })

  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 120 })
  const buffer = await renderToBuffer(<FacturaCDocument data={data} qrDataUrl={qrDataUrl} />)
  return Buffer.from(buffer)
}
