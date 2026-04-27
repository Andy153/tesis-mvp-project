import type { Analysis, Finding } from './types';
import type { HistoryItem, TrackingCobro } from './history';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toSwissRowDateISO(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function iso(d: Date): string {
  return d.toISOString();
}

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length]!;
}

function mkFinding(severity: Finding['severity'], code: string, title: string, body: string, action?: string): Finding {
  return { severity, code, title, body, action };
}

function mkAnalysis(args: {
  fileName: string;
  tipo: string;
  codigo: string;
  prepagas?: string[];
  findings: Finding[];
}): Analysis {
  const summary = {
    ok: args.findings.filter((f) => f.severity === 'ok').length,
    warn: args.findings.filter((f) => f.severity === 'warn').length,
    error: args.findings.filter((f) => f.severity === 'error').length,
  };
  const overall: Analysis['overall'] = summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';
  return {
    findings: args.findings,
    summary,
    overall,
    detected: {
      codes: [args.codigo],
      prepagas: args.prepagas ?? ['Swiss Medical'],
      sanatorios: ['Sanatorio Mater Dei'],
      fechas: [],
      procedureGuess: { keyword: args.tipo, code: args.codigo, desc: args.tipo },
    },
    fileName: args.fileName,
    analyzedAt: new Date().toISOString(),
  };
}

export function getMockHistory(): HistoryItem[] {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const inThisMonth = (day: number) => new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0, 0);
  const prevMonthMid = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0, 0);
  const prev2MonthMid = new Date(now.getFullYear(), now.getMonth() - 2, 15, 12, 0, 0, 0);

  // Base fechas de práctica (dd/mm/yyyy). Ajustadas para que:
  // - los 5 items con error sean "frescos" (últimos 30–50 días)
  // - exista al menos un caso de "plazo próximo a vencer" (>50 días sin presentar)
  const baseDates: Date[] = [
    addDays(now, -32),
    addDays(now, -35),
    addDays(now, -41),
    addDays(now, -46),
    addDays(now, -49),
    // ready items (sin tracking)
    addDays(now, -12),
    addDays(now, -18),
    addDays(now, -23),
    addDays(now, -53), // dispara "plazo próximo a vencer" (≈7 días restantes)
    // resto se distribuye en meses previos
    addDays(prevMonthMid, -6),
    addDays(prevMonthMid, -14),
    addDays(prevMonthMid, -22),
    addDays(prev2MonthMid, -4),
    addDays(prev2MonthMid, -12),
    addDays(prev2MonthMid, -20),
  ];

  // Para que el calendario/proyección del mes actual tenga variedad:
  const pendienteEstDias = [3, 7, 12, 18, 24]; // 5 días distintos este mes
  const cobradoRealDias = [5, 10, 15, 20]; // 4 cobros reales este mes
  const cobradoEstDias = [6, 11, 16, 21]; // y 4 estimados también caen este mes (para proyección)

  const pacientes = ['M.L.G.', 'C.P.', 'A.R.M.', 'J.B.', 'S.N.', 'L.F.', 'V.P.', 'D.C.', 'G.R.', 'N.A.', 'P.S.', 'E.M.'];
  const instituciones = ['Sanatorio Mater Dei', 'Sanatorio Otamendi', 'Clínica del Sol', 'Hospital Alemán'];

  const tipos = [
    { tipo: 'Consulta', rango: [15000, 25000], codigo: '1010' },
    { tipo: 'Ecografía ginecológica', rango: [20000, 40000], codigo: '2040' },
    { tipo: 'Colposcopía', rango: [25000, 45000], codigo: '3050' },
    { tipo: 'Parto vaginal', rango: [400000, 700000], codigo: '4010' },
    { tipo: 'Cesárea', rango: [500000, 900000], codigo: '4020' },
    { tipo: 'Histerectomía', rango: [600000, 1000000], codigo: '6010' },
  ] as const;

  const amountFor = (i: number, min: number, max: number) => {
    // deterministic spread across range
    const t = (i % 10) / 9;
    return Math.round(min + (max - min) * t);
  };

  const mkItem = (
    i: number,
    opts: { kind: 'error_draft' | 'ready' | 'presented' | 'paid' | 'rejected' | 'clean_draft' },
    datePracticaOverride?: Date,
  ) => {
    const t = pick(tipos as any, i) as (typeof tipos)[number];
    const datePractica = datePracticaOverride ?? pick(baseDates, i);
    const montoOriginal = amountFor(i, t.rango[0], t.rango[1]);
    const paciente = pick(pacientes, i);
    const inst = pick(instituciones, i);
    const fileName = `parte_${t.tipo.replace(/\s+/g, '_').toLowerCase()}_${toSwissRowDateISO(datePractica).replace(/\//g, '-')}.pdf`;

    const findings: Finding[] = [];
    if (opts.kind === 'error_draft') {
      findings.push(
        mkFinding(
          'error',
          'NO_CODE',
          'Falta el código de nomenclador',
          'No se detectó un código de facturación en el documento.',
          'Agregar el código correspondiente del nomenclador de la prepaga.',
        ),
      );
    } else if (opts.kind === 'clean_draft') {
      findings.push(mkFinding('ok', 'PLAZO_OK', 'Dentro del plazo de presentación', 'Documento dentro del plazo normal.'));
    } else {
      findings.push(mkFinding('ok', `CODE_OK_${t.codigo}`, `Código ${t.codigo} coincide con el procedimiento`, t.tipo));
    }

    // Meter al menos un warning limpio para que la card de atención muestre los 4 tipos
    if (opts.kind === 'ready' && i === 7) {
      findings.push(
        mkFinding(
          'warn',
          'LOW_CONTENT',
          'Contenido escaso o ilegible',
          'Se pudieron reconocer pocas palabras en el documento. Revisar legibilidad.',
          'Re-escanear en mayor resolución o solicitar copia legible.',
        ),
      );
    }

    const analysis = mkAnalysis({
      fileName,
      tipo: t.tipo,
      codigo: t.codigo,
      findings,
    });

    const planillaFiles =
      opts.kind === 'ready' || opts.kind === 'presented' || opts.kind === 'paid' || opts.kind === 'rejected'
        ? {
            interventionId: `int_${i}`,
            parteUrl: `/api/interventions/int_${i}/files/parte`,
            permisoUrl: i % 3 === 0 ? `/api/interventions/int_${i}/files/permiso` : undefined,
            xlsxUrl: `/api/interventions/int_${i}/files/xlsx`,
            csvUrl: `/api/interventions/int_${i}/files/csv`,
          }
        : undefined;

    let tracking: TrackingCobro | undefined = undefined;
    if (opts.kind === 'presented') {
      // Garantizar 5 pendientes con fechaCobroEstimada en el mes actual
      const pendingIdx = i - 9; // 0..9
      const estThisMonth = pendingIdx >= 0 && pendingIdx < 5 ? inThisMonth(pendienteEstDias[pendingIdx]!) : null;
      const fp = estThisMonth ? addDays(estThisMonth, -60) : addDays(datePractica, 3);
      tracking = {
        estado: 'presentado',
        fechaPresentacion: iso(fp),
        fechaCobroEstimada: iso(estThisMonth ?? addDays(fp, 60)),
        montoOriginal,
      };
    }
    if (opts.kind === 'paid') {
      // Garantizar 4 cobrados con fechaCobroReal en el mes actual.
      const paidIdx = i - 19; // 0..7
      const realThisMonth = paidIdx >= 0 && paidIdx < 4 ? inThisMonth(cobradoRealDias[paidIdx]!) : null;
      const estThisMonth = paidIdx >= 0 && paidIdx < 4 ? inThisMonth(cobradoEstDias[paidIdx]!) : null;
      const fp = realThisMonth ? addDays(realThisMonth, -(55 + (paidIdx % 5))) : addDays(datePractica, 4);
      const est = estThisMonth ?? addDays(fp, 60);
      const real = realThisMonth ?? addDays(fp, 55 + (i % 21)); // resto 45–75 aprox
      tracking = {
        estado: 'cobrado',
        fechaPresentacion: iso(fp),
        fechaCobroEstimada: iso(est),
        fechaCobroReal: iso(real),
        montoOriginal,
        montoCobrado: montoOriginal,
      };
    }
    if (opts.kind === 'rejected') {
      const fp = addDays(datePractica, 5);
      const motivos = ['Falta autorización previa', 'Código de nomenclador incorrecto'];
      tracking = {
        estado: 'rechazado',
        fechaPresentacion: iso(fp),
        fechaCobroEstimada: iso(addDays(fp, 60)),
        montoOriginal,
        motivoRechazo: pick(motivos, i),
      };
    }

    const base: HistoryItem = {
      id: `mock_${i}`,
      name: fileName,
      size: 240_000 + i * 1000,
      type: 'application/pdf',
      addedAt: iso(addDays(datePractica, 1)),
      status: 'analyzed',
      analysis,
      exports: planillaFiles
        ? {
            swissCx: {
              createdAt: iso(addDays(datePractica, 2)),
              parteFileId: `mock_${i}`,
              batchId: `b_mock`,
              row: {
                fecha: toSwissRowDateISO(datePractica),
                socio: String(10000000 + i),
                socioDesc: paciente,
                codigo: t.codigo,
                cant: '1',
                detalle: t.tipo,
                institucion: inst,
                cir: '',
                ayud: '',
                inst: '',
                urgencia: '',
                gastos: '',
                nroAutorizacion: '',
              },
              files: planillaFiles,
            },
          }
        : undefined,
      tracking,
    };

    return base;
  };

  const out: HistoryItem[] = [];

  // 5 borrador con errors (sin tracking, estado efectivo con_errores)
  for (let i = 0; i < 5; i++) out.push(mkItem(i, { kind: 'error_draft' }));

  // 4 listo_para_presentar (sin tracking, con planilla generada, sin error)
  for (let i = 5; i < 9; i++) out.push(mkItem(i, { kind: 'ready' }));

  // 10 presentado
  for (let i = 9; i < 19; i++) out.push(mkItem(i, { kind: 'presented' }));

  // 8 cobrado
  for (let i = 19; i < 27; i++) out.push(mkItem(i, { kind: 'paid' }));

  // 2 rechazado
  for (let i = 27; i < 29; i++) out.push(mkItem(i, { kind: 'rejected' }));

  // 1 borrador limpio
  out.push(mkItem(29, { kind: 'clean_draft' }));

  return out.slice(0, 30);
}

