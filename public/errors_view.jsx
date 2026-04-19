// Trazá — Errors view (pestaña consolidada de errores detectados)

function ErrorsView({ files, onOpenFile }) {
  const [filter, setFilter] = React.useState('all');

  // Aplanar findings de todos los archivos analizados
  const allErrors = [];
  for (const f of files) {
    if (!f.analysis) continue;
    for (const finding of f.analysis.findings) {
      if (finding.severity === 'ok') continue; // solo mostramos problemas
      allErrors.push({
        ...finding,
        fileId: f.id,
        fileName: f.name,
        fileDate: f.addedAt,
        prepaga: f.analysis.detected.prepagas[0] || '—',
        codigo: f.analysis.detected.codes[0] || null,
      });
    }
  }

  const counts = {
    all: allErrors.length,
    error: allErrors.filter(e => e.severity === 'error').length,
    warn: allErrors.filter(e => e.severity === 'warn').length,
  };

  const filtered = filter === 'all' ? allErrors : allErrors.filter(e => e.severity === filter);

  // Totales por archivo
  const filesAnalyzed = files.filter(f => f.analysis).length;
  const filesWithErrors = files.filter(f => f.analysis?.overall === 'error').length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Errores detectados</h1>
          <p className="page-subtitle">Historial consolidado de todos los errores encontrados en tus documentos. Corregilos antes de presentar para evitar rechazos.</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Documentos analizados</div>
          <div className="stat-value">{filesAnalyzed}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Con errores críticos</div>
          <div className="stat-value error">{filesWithErrors}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Errores totales</div>
          <div className="stat-value error">{counts.error}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Advertencias</div>
          <div className="stat-value warn">{counts.warn}</div>
        </div>
      </div>

      <div className="errors-toolbar">
        <div className={`filter-chip ${filter==='all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Todos <span className="count">{counts.all}</span>
        </div>
        <div className={`filter-chip ${filter==='error' ? 'active' : ''}`} onClick={() => setFilter('error')}>
          Errores <span className="count">{counts.error}</span>
        </div>
        <div className={`filter-chip ${filter==='warn' ? 'active' : ''}`} onClick={() => setFilter('warn')}>
          Advertencias <span className="count">{counts.warn}</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty">
          <div className="empty-icon"><window.Icon name="empty" size={48} /></div>
          <div className="empty-title">
            {allErrors.length === 0 ? 'Todavía no analizaste documentos' : 'Sin resultados para este filtro'}
          </div>
          <div>
            {allErrors.length === 0
              ? 'Subí un documento en la pestaña "Cargar documentos" para empezar'
              : 'Probá con otro filtro'}
          </div>
        </div>
      ) : (
        <div className="errors-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Sev.</th>
                <th>Problema</th>
                <th style={{ width: 200 }}>Archivo</th>
                <th style={{ width: 130 }}>Prepaga</th>
                <th style={{ width: 100 }}>Código</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={i}>
                  <td>
                    {e.severity === 'error' && <span className="badge badge-error"><span className="badge-dot"></span>Error</span>}
                    {e.severity === 'warn' && <span className="badge badge-warn"><span className="badge-dot"></span>Warn</span>}
                    {e.severity === 'info' && <span className="badge badge-neutral"><span className="badge-dot"></span>Manual</span>}
                  </td>
                  <td>
                    <div className="err-msg">{e.title}</div>
                    <div className="err-hint">{e.action || e.body}</div>
                  </td>
                  <td>
                    <div className="err-file">{e.fileName}</div>
                    <div className="err-hint">{new Date(e.fileDate).toLocaleDateString('es-AR')}</div>
                  </td>
                  <td>{e.prepaga}</td>
                  <td>{e.codigo ? <code style={{fontFamily:'var(--font-mono)', fontSize:11.5}}>{e.codigo}</code> : <span style={{color:'var(--text-soft)'}}>—</span>}</td>
                  <td>
                    <button className="btn btn-sm btn-ghost" onClick={() => onOpenFile(e.fileId)}>
                      Ver archivo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

window.ErrorsView = ErrorsView;
