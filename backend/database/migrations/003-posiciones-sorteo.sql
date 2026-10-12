-- ============================================================================
--  Migración 003 · Posiciones del sorteo (grilla 1 a 20)
--
--  El jugador controla el sorteo viendo la grilla de posiciones 1..20 con el
--  número que salió en cada una. Para que esa grilla sea un registro fiel de
--  la quiniela hay que guardar TODAS las posiciones, incluidas las que no
--  suman al bingo (porque esas dos cifras ya habían salido).
--
--  Cambios:
--    · `orden` pasa a significar la POSICIÓN en el sorteo (1..20), no el orden
--      de inserción. La UNIQUE (jornada_id, orden) ya garantiza una sola
--      entrada por posición.
--    · Se agrega `cuenta`: 1 si ese número es el que vale para validar los
--      cartones, 0 si es repetido o cae fuera del rango del sorteo.
--    · Se elimina UNIQUE (jornada_id, numero): en la quiniela es normal que
--      dos posiciones terminen en las mismas dos cifras.
--
--  Aplicar:  npm run migrar:posiciones     (idempotente)
-- ============================================================================
USE bingodgg;

ALTER TABLE numeros_extraidos
  ADD COLUMN cuenta TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = valida cartones; 0 = repetido o fuera de rango' AFTER valor_cargado;

-- Permite varias posiciones con las mismas dos cifras dentro de una jornada.
ALTER TABLE numeros_extraidos
  DROP INDEX uq_extraido_jornada_numero;

-- Índice de apoyo para las consultas de validación.
ALTER TABLE numeros_extraidos
  ADD INDEX idx_extraido_numero (jornada_id, numero, cuenta);

-- Lo ya cargado contaba para los cartones.
UPDATE numeros_extraidos SET cuenta = 1;
