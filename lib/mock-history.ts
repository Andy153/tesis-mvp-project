import type { HistoryItem } from './history';

export function getMockHistory(): HistoryItem[] {
  const now = new Date();
  const inThisMonth = (day: number) => new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);

  const iso = (d: Date) => d.toISOString();

  const mk = (args: {
    id: string;
    paciente: string;
    detalle: string;
    codigo: string;
    obra: 'OSDE' | 'Swiss Medical';
    plan: string;
    tipo: 'Amb' | 'Int';
    fechaPractica: Date;
  }): HistoryItem => {
    const fileName = `mock_${args.id}_${args.codigo}.pdf`;

    const hasQuirurgico = args.tipo === 'Int';

    const aiParteExtract = {
      paciente: {
        apellido_nombre: args.paciente,
        dni: null,
        fecha_nacimiento: null,
        edad: null,
        sexo: null,
      },
      cobertura: {
        prepaga: args.obra,
        plan: args.plan,
        numero_afiliado: null,
      },
      sanatorio: null,
      cirugia: {
        fecha: `${String(args.fechaPractica.getDate()).padStart(2, '0')}/${String(args.fechaPractica.getMonth() + 1).padStart(2, '0')}/${args.fechaPractica.getFullYear()}`,
        hora_inicio: null,
        hora_fin: null,
        quirofano: null,
        nro_cirugia: null,
      },
      equipo_quirurgico: hasQuirurgico
        ? {
            cirujano: 'Dr/a X',
            matricula_cirujano: 12345,
            primer_ayudante: null,
            segundo_ayudante: null,
            anestesista: null,
            instrumentador: null,
            circulante: null,
          }
        : {
            cirujano: null,
            matricula_cirujano: null,
            primer_ayudante: null,
            segundo_ayudante: null,
            anestesista: null,
            instrumentador: null,
            circulante: null,
          },
      procedimiento: {
        tipo_reservado: null,
        tipo_realizado: args.detalle,
        descripcion_tecnica: null,
        codigo_nomenclador: args.codigo,
        diagnostico_operatorio: null,
      },
      anestesia: hasQuirurgico
        ? {
            tipo: 'General',
            nivel_complejidad: 1,
            prioridad: null,
          }
        : {
            tipo: null,
            nivel_complejidad: null,
            prioridad: null,
          },
      biopsia: { se_tomo: false, descripcion: null },
    };

    return {
      id: args.id,
      name: fileName,
      size: 240_000,
      type: 'application/pdf',
      addedAt: iso(inThisMonth(2)),
      status: 'analyzed',
      analysis: undefined,
      aiParteExtract: aiParteExtract as any,
      exports: {
        swissCx: {
          createdAt: iso(inThisMonth(2)),
          parteFileId: args.id,
          batchId: 'b_mock',
          row: {
            fecha: aiParteExtract.cirugia.fecha,
            socio: '0000000000',
            socioDesc: args.paciente,
            codigo: args.codigo,
            cant: '1',
            detalle: args.detalle,
            institucion: '',
            cir: '',
            ayud: '',
            inst: '',
            urgencia: '',
            gastos: '',
            nroAutorizacion: '',
          },
        },
      },
      tracking: {
        estado: 'presentado',
        fechaPresentacion: iso(monthStart),
      },
    };
  };

  return [
    mk({
      id: 'mock_1',
      paciente: 'M.L.G.',
      detalle: 'Consulta',
      codigo: '420101',
      obra: 'OSDE',
      plan: '510',
      tipo: 'Amb',
      fechaPractica: inThisMonth(2),
    }),
    mk({
      id: 'mock_2',
      paciente: 'C.P.',
      detalle: 'Colposcopía',
      codigo: '220101',
      obra: 'OSDE',
      plan: '310',
      tipo: 'Amb',
      fechaPractica: inThisMonth(3),
    }),
    mk({
      id: 'mock_3',
      paciente: 'A.R.M.',
      detalle: 'Raspado uterino terapéutico',
      codigo: '110210',
      obra: 'OSDE',
      plan: '410',
      tipo: 'Amb',
      fechaPractica: inThisMonth(4),
    }),
    mk({
      id: 'mock_4',
      paciente: 'J.B.',
      detalle: 'Parto',
      codigo: '110401',
      obra: 'Swiss Medical',
      plan: 'cualquiera',
      tipo: 'Int',
      fechaPractica: inThisMonth(5),
    }),
    mk({
      id: 'mock_5',
      paciente: 'S.N.',
      detalle: 'Cesárea',
      codigo: '110403',
      obra: 'OSDE',
      plan: '510',
      tipo: 'Int',
      fechaPractica: inThisMonth(6),
    }),
  ];
}

