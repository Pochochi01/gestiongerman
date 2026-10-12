-- ============================================================================
--  Migración 004 · PDF del cartón, QR de validación y color por sorteo
--
--  sorteos.color_carton
--    Color con el que se dibujan TODOS los cartones de ese sorteo. Vive en
--    `sorteos` y no en `cartones` a propósito: el color depende del sorteo, no
--    del cartón. Guardarlo en cada cartón sería una dependencia transitiva
--    (rompe 3FN) y permitiría que dos cartones del mismo sorteo quedaran con
--    colores distintos, justo lo que el requerimiento prohíbe.
--
--  cartones.token_validacion
--    Cadena aleatoria que va dentro del QR del PDF. Permite validar el cartón
--    sin exponer ids secuenciales ni requerir que quien valida tenga cuenta.
--
--  cartones.pdf_archivo / pdf_generado_en
--    Referencia al PDF emitido para ese cartón.
--
--  Aplicar:  npm run migrar:pdf      (idempotente)
-- ============================================================================
USE bingodgg;

ALTER TABLE sorteos
  ADD COLUMN color_carton VARCHAR(7) NOT NULL DEFAULT '#1f40f5'
    COMMENT 'Color de los cartones de este sorteo (hex)' AFTER precio_carton;

ALTER TABLE cartones
  ADD COLUMN token_validacion CHAR(32) NULL
    COMMENT 'Token del QR de validacion' AFTER codigo,
  ADD COLUMN pdf_archivo VARCHAR(255) NULL
    COMMENT 'Nombre del PDF emitido' AFTER habilitado_en,
  ADD COLUMN pdf_generado_en DATETIME NULL AFTER pdf_archivo;

-- El token es la clave de acceso al cartón: tiene que ser único.
ALTER TABLE cartones
  ADD UNIQUE KEY uq_carton_token (token_validacion);
