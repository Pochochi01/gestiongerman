-- ============================================================================
--  Migración 002 · Carga de números por quiniela (4 cifras)
--
--  El administrador carga los números tal como salen en la quiniela (hasta 4
--  cifras) y el sistema valida los cartones con las DOS ÚLTIMAS cifras.
--
--  jornadas:
--    nombre         -> loteria de la que se toman los números ('Nocturna')
--    numero_sorteo  -> número de sorteo de esa quiniela
--  numeros_extraidos:
--    valor_cargado  -> lo que tipeó el administrador (ej. 1234)
--    numero         -> las dos últimas cifras, que es lo que valida (ej. 34)
--
--  Aplicar:  npm run migrar:nocturna     (idempotente)
--  o bien:   mysql -u root -p bingodgg < 002-jornada-nocturna.sql
-- ============================================================================
USE bingodgg;

ALTER TABLE jornadas
  ADD COLUMN nombre VARCHAR(40) NOT NULL DEFAULT 'Nocturna'
    COMMENT 'Loteria de la que se toman los numeros' AFTER fecha,
  ADD COLUMN numero_sorteo INT UNSIGNED NULL
    COMMENT 'Numero de sorteo de la quiniela' AFTER nombre;

ALTER TABLE numeros_extraidos
  ADD COLUMN valor_cargado SMALLINT UNSIGNED NULL
    COMMENT 'Valor de hasta 4 cifras ingresado por el administrador' AFTER numero;

-- Para los registros que ya existían, el valor cargado era el número mismo.
UPDATE numeros_extraidos SET valor_cargado = numero WHERE valor_cargado IS NULL;
