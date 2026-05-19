-- Renombrar columnas CAI → CAE (Código de Autorización Electrónico)
-- Los datos existentes se conservan con RENAME COLUMN.

ALTER TABLE monthly_submissions
  RENAME COLUMN cai_numero TO cae_numero;

ALTER TABLE monthly_submissions
  RENAME COLUMN cai_vencimiento TO cae_vencimiento;
