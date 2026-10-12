-- ============================================================================
--  Migración 005 · Se quita la geolocalización
--
--  El sistema deja de usar mapas (Leaflet queda desinstalado), así que las
--  coordenadas no tienen a quién servir.
--
--  Se elimina:
--    · tabla `ubicaciones` y las columnas que la referencian
--    · `jugadores.domicilio_id`: el alta de jugador ya no pide domicilio
--
--  Se conserva:
--    · `domicilios`, con `localidad_id` ahora NULL: el vendedor mantiene un
--      domicilio simple de calle y número, sin provincia ni localidad
--    · `localidades` y `provincias`: quedan sin uso, pero no se borran para no
--      perder el catálogo si más adelante vuelve el domicilio completo
--
--  IRREVERSIBLE: se pierden las coordenadas cargadas.
--
--  Aplicar:  npm run migrar:sin-geo      (idempotente)
-- ============================================================================
USE bingodgg;

-- Las FK hay que soltarlas antes que las columnas.
ALTER TABLE vendedores DROP FOREIGN KEY fk_vendedor_ubicacion;
ALTER TABLE vendedores DROP COLUMN ubicacion_id;

ALTER TABLE jugadores DROP FOREIGN KEY fk_jugador_ubicacion;
ALTER TABLE jugadores DROP COLUMN ubicacion_id;

ALTER TABLE jugadores DROP FOREIGN KEY fk_jugador_domicilio;
ALTER TABLE jugadores DROP COLUMN domicilio_id;

DROP TABLE ubicaciones;

-- Un domicilio puede ser sólo calle y número.
ALTER TABLE domicilios MODIFY COLUMN localidad_id INT UNSIGNED NULL;
