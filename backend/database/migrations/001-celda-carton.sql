-- ============================================================================
--  Migración 001 · Disposición gráfica del cartón (grilla 3 x 10)
--
--  Agrega `carton_numeros.celda`: el casillero (1..30) que ocupa cada número
--  dentro del cartón. Se guarda porque la ubicación se sortea UNA sola vez, al
--  crear el cartón: si se calculara al mostrarlo, el cartón del jugador
--  cambiaría de forma en cada consulta.
--
--  Para los cartones que ya existen, el backfill lo hace el script de Node,
--  que es el que sabe repartir los números al azar:
--      npm run migrar:celdas
--
--  Aplicar sólo el ALTER:
--      mysql -u root -p bingodgg < 001-celda-carton.sql
-- ============================================================================
USE bingodgg;

ALTER TABLE carton_numeros
  ADD COLUMN celda TINYINT UNSIGNED NULL COMMENT 'Casillero 1..30 en la grilla 3x10'
  AFTER posicion;

-- Dos números no pueden compartir casillero dentro del mismo cartón.
-- (Admite NULL: los cartones viejos quedan sin celda hasta el backfill.)
ALTER TABLE carton_numeros
  ADD UNIQUE KEY uq_carton_celda (carton_id, celda);
