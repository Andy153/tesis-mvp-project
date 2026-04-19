// Nomenclador Swiss Medical - Datos de codigos y procedimientos

export const NOMENCLADOR_FULL: Record<string, { desc: string; specialty: string }> = {
  "19031": { desc: "Ferritina", specialty: "Onco Hematologia" },
  "20106": { desc: "Enucleacion o evisceracion del globo ocular con o sin implante", specialty: "Oftalmologia" },
  "20109": { desc: "Tratamiento quirurgico corrector del estrabismo", specialty: "Oftalmologia" },
  "20205": { desc: "Escision de lesion de parpados, blefarectomia", specialty: "Oftalmologia" },
  "20301": { desc: "Conjuntivoplastia", specialty: "Oftalmologia" },
  "20302": { desc: "Escision de lesion conjuntiva", specialty: "Oftalmologia" },
  "20304": { desc: "Peritectomia, peritomia", specialty: "Oftalmologia" },
  "20305": { desc: "Sutura de conjuntiva", specialty: "Oftalmologia" },
  "20306": { desc: "Introduccion de substancias terapeuticas inyectables subconjuntivales", specialty: "Oftalmologia" },
  "20403": { desc: "Sutura de cornea", specialty: "Oftalmologia" },
  "20406": { desc: "Sutura de herida de cornea con prolapso de iris", specialty: "Oftalmologia" },
  "20501": { desc: "Tratamiento quirurgico del glaucoma", specialty: "Oftalmologia" },
  "20502": { desc: "Iridatomia, coreoplastia, iridectomia", specialty: "Oftalmologia" },
  "20803": { desc: "Drenaje de glandula o saco lagrimal", specialty: "Oftalmologia" },
  "20804": { desc: "Cateterizacion de conducto lagrimonasal en quirofano con anestesia general", specialty: "Oftalmologia" },
  "21010": { desc: "Antitrombina III funcional", specialty: "Onco Hematologia" },
  "21074": { desc: "Proteina C funcional", specialty: "Onco Hematologia" },
  "21076": { desc: "Proteina S funcional", specialty: "Onco Hematologia" },
  "24014": { desc: "Factor V leiden", specialty: "Onco Hematologia" },
  "110401": { desc: "Atencion del parto", specialty: "Obstetricia" },
  "110402": { desc: "Evacuacion uterina segundo trimestre", specialty: "Obstetricia" },
  "110403": { desc: "Cesarea", specialty: "Obstetricia" },
  "110404": { desc: "Alumbramiento manual, extraccion manual de placenta", specialty: "Obstetricia" },
  "110405": { desc: "Cesarea con 2 o mas previas, utero cicatrizal", specialty: "Obstetricia" },
  "11040305": { desc: "Cesarea mas ligadura tubaria", specialty: "Obstetricia" },
  "110201": { desc: "Histerectomia radical, Piver, colpoanexohisterectomia", specialty: "Ginecologia" },
  "110203": { desc: "Histerectomia total", specialty: "Ginecologia" },
  "110204": { desc: "Miomectomia uterina abdominal", specialty: "Ginecologia" },
  "110205": { desc: "Miomectomia vaginal, mioma nascens", specialty: "Ginecologia" },
  "110210": { desc: "Raspado por aborto, legrado por aborto", specialty: "Ginecologia" },
  "110214": { desc: "Cerclaje", specialty: "Ginecologia" },
  "110215": { desc: "Biopsia de cervix, biopsia de cuello", specialty: "Ginecologia" },
  "110217": { desc: "Colocacion de DIU", specialty: "Ginecologia" },
  "11021104": { desc: "Histerectomia laparoscopica", specialty: "Ginecologia" },
  "11021107": { desc: "Legrado endocervical, cepillado endocervical, extraccion de DIU", specialty: "Ginecologia" },
  "110316": { desc: "Episiorrafia, perineorrafia", specialty: "Obstetricia" },
  "320104": { desc: "Atencion del recien nacido", specialty: "Neonatologia" },
  "60101": { desc: "Mastectomia radical modificada", specialty: "Cirugia" },
}

export const PROC_KEYWORDS: { keywords: string[]; code: string }[] = [
  { keywords: ["cesarea clasica", "cesarea clasica", "operacion cesarea clasica"], code: "110403" },
  { keywords: ["cesarea con 2 previas", "cesarea 2da previa", "cesarea 2da o mas previas", "cesarea iterativa", "cesarea con cirugia uterina previa", "utero cicatrizal"], code: "110405" },
  { keywords: ["cesarea mas ligadura tubaria", "cesarea mas ligadura tubaria", "cesarea con ligadura"], code: "11040305" },
  { keywords: ["cesarea", "cesarea", "operacion cesarea", "operacion cesarea"], code: "110403" },
  { keywords: ["parto", "atencion del parto", "atencion del parto", "parto normal", "parto eutocico", "parto vaginal"], code: "110401" },
  { keywords: ["alumbramiento manual", "extraccion manual de placenta"], code: "110404" },
  { keywords: ["evacuacion uterina segundo trimestre", "aborto tardio"], code: "110402" },
  { keywords: ["raspado por aborto", "legrado por aborto", "aborto incompleto", "aborto espontaneo"], code: "110210" },
  { keywords: ["episiorrafia", "perineorrafia"], code: "110316" },
  { keywords: ["atencion del recien nacido", "atencion neonatal", "recien nacido"], code: "320104" },
  { keywords: ["histerectomia laparoscopica", "histerectomia laparoscopica", "histerectomia por laparoscopia"], code: "11021104" },
  { keywords: ["histerectomia radical", "piver", "colpoanexohisterectomia"], code: "110201" },
  { keywords: ["histerectomia", "histerectomia", "histerectomia total", "histerectomia abdominal", "histerectomia vaginal"], code: "110203" },
  { keywords: ["miomectomia vaginal", "mioma nascens"], code: "110205" },
  { keywords: ["miomectomia uterina abdominal", "miomectomia abdominal", "miomectomia", "miomectomia"], code: "110204" },
  { keywords: ["legrado endocervical", "cepillado endocervical", "extraccion de diu"], code: "11021107" },
  { keywords: ["colocacion de diu", "diu"], code: "110217" },
  { keywords: ["cerclaje"], code: "110214" },
  { keywords: ["biopsia de cervix", "biopsia de cuello"], code: "110215" },
  { keywords: ["mastectomia radical modificada", "madden", "patey", "halsted"], code: "60101" },
]

export const PREPAGAS = [
  "Swiss Medical", "OSDE", "Galeno", "Medicus", "Omint", "Medife",
  "Sancor Salud", "Hospital Italiano", "Hospital Britanico", "Prevencion Salud"
]

export const SANATORIOS = [
  "Otamendi", "Mater Dei", "Los Arcos", "Suizo Argentino", "Finochietto",
  "Clinica Santa Isabel", "Instituto Argentino de Diagnostico", "Clinica Bazterrica"
]

export const REQUIRED_FIELDS = [
  { key: "prepaga", labels: ["prepaga", "obra social", "convenio", "financiador", "cobertura"], severity: "error" as const },
  { key: "fecha", labels: ["fecha"], severity: "error" as const },
  { key: "procedimiento", labels: ["procedimiento", "practica", "intervencion", "cirugia", "operacion"], severity: "error" as const },
  { key: "codigo", labels: ["codigo", "codigo nomenclador", "nomenclador", "cod. nomenclador"], severity: "error" as const },
  { key: "sanatorio", labels: ["sanatorio", "clinica", "institucion", "centro asistencial"], severity: "warn" as const },
  { key: "anestesia", labels: ["anestesia", "tipo de anestesia"], severity: "warn" as const },
  { key: "diagnostico", labels: ["diagnostico", "dx"], severity: "error" as const },
]
