-- ============================================================================
--  BingoDGG - Esquema de base de datos (MySQL 8.x)
--  Normalizado hasta 3FN.
--  Ejecutar:  mysql -u root -p < schema.sql
-- ============================================================================

DROP DATABASE IF EXISTS bingodgg;
CREATE DATABASE bingodgg
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE bingodgg;

-- ---------------------------------------------------------------------------
-- 1. TABLAS DE REFERENCIA (catalogos) -> eliminan dependencias transitivas
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id          TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(20)  NOT NULL UNIQUE,   -- ADMIN | VENDEDOR | JUGADOR
  nombre      VARCHAR(60)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE estados_sorteo (
  id          TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(20)  NOT NULL UNIQUE,   -- CONFIGURACION | EN_VENTA | EN_CURSO | FINALIZADO | CANCELADO
  nombre      VARCHAR(60)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE estados_pago (
  id          TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(20)  NOT NULL UNIQUE,   -- IMPAGO | RENDIDO | PAGADO
  nombre      VARCHAR(60)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE estados_carton (
  id          TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(20)  NOT NULL UNIQUE,   -- ACTIVO | GANADOR | ANULADO
  nombre      VARCHAR(60)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE tipos_mensaje (
  id          TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(30)  NOT NULL UNIQUE,   -- CARTON_NUEVO | CARTON_HABILITADO | SORTEO_INICIADO | NUMEROS_DIA | GANADOR
  nombre      VARCHAR(80)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE estados_envio (
  id          TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(20)  NOT NULL UNIQUE,   -- PENDIENTE | ENVIADO | ERROR
  nombre      VARCHAR(60)  NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 2. DOMICILIOS
--    El sistema no usa mapas ni coordenadas. Queda el domicilio del vendedor
--    como calle + numero; localidades y provincias se conservan como catalogo
--    por si vuelve el domicilio completo, pero hoy no se usan.
-- ---------------------------------------------------------------------------

CREATE TABLE provincias (
  id          SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre      VARCHAR(80)  NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE localidades (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provincia_id  SMALLINT UNSIGNED NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  codigo_postal VARCHAR(10)  NULL,
  CONSTRAINT fk_localidad_provincia FOREIGN KEY (provincia_id)
    REFERENCES provincias(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_localidad (provincia_id, nombre)
) ENGINE=InnoDB;

CREATE TABLE domicilios (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  localidad_id  INT UNSIGNED NULL,          -- sin uso: el domicilio es calle + numero
  calle         VARCHAR(150) NOT NULL,
  numero        VARCHAR(15)  NULL,
  piso          VARCHAR(10)  NULL,
  departamento  VARCHAR(10)  NULL,
  referencia    VARCHAR(255) NULL,
  CONSTRAINT fk_domicilio_localidad FOREIGN KEY (localidad_id)
    REFERENCES localidades(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 3. USUARIOS (autenticacion)
-- ---------------------------------------------------------------------------

CREATE TABLE usuarios (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  rol_id         TINYINT UNSIGNED NOT NULL,
  username       VARCHAR(40)  NOT NULL UNIQUE,  -- DNI para vendedor/jugador
  password_hash  VARCHAR(255) NOT NULL,
  debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 1,
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso  DATETIME NULL,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuario_rol FOREIGN KEY (rol_id)
    REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 4. VENDEDORES Y JUGADORES
-- ---------------------------------------------------------------------------

CREATE TABLE vendedores (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id     INT UNSIGNED NOT NULL UNIQUE,
  apellido       VARCHAR(80)  NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  dni            VARCHAR(15)  NOT NULL UNIQUE,
  telefono       VARCHAR(25)  NOT NULL,
  domicilio_id   INT UNSIGNED NULL,
  habilitado     TINYINT(1) NOT NULL DEFAULT 1,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendedor_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)    ON DELETE CASCADE,
  CONSTRAINT fk_vendedor_domicilio FOREIGN KEY (domicilio_id) REFERENCES domicilios(id)  ON DELETE SET NULL,
  INDEX idx_vendedor_habilitado (habilitado)
) ENGINE=InnoDB;

CREATE TABLE jugadores (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id     INT UNSIGNED NOT NULL UNIQUE,
  vendedor_id    INT UNSIGNED NOT NULL,
  apellido       VARCHAR(80)  NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  dni            VARCHAR(15)  NOT NULL UNIQUE,
  whatsapp       VARCHAR(25)  NOT NULL,   -- E.164 sin '+', ej 5493764123456
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_jugador_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)    ON DELETE CASCADE,
  CONSTRAINT fk_jugador_vendedor  FOREIGN KEY (vendedor_id)  REFERENCES vendedores(id)  ON DELETE RESTRICT,
  INDEX idx_jugador_vendedor (vendedor_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 5. SORTEOS
-- ---------------------------------------------------------------------------

CREATE TABLE sorteos (
  id                  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  numero              INT UNSIGNED NOT NULL UNIQUE,
  nombre              VARCHAR(120) NOT NULL,
  estado_id           TINYINT UNSIGNED NOT NULL,
  cartones_objetivo   INT UNSIGNED NOT NULL,
  numeros_por_carton  TINYINT UNSIGNED NOT NULL DEFAULT 10,
  rango_min           SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  rango_max           SMALLINT UNSIGNED NOT NULL DEFAULT 90,
  precio_carton       DECIMAL(12,2) NOT NULL DEFAULT 0,
  color_carton        VARCHAR(7) NOT NULL DEFAULT '#1f40f5',  -- color de sus cartones
  creado_por          INT UNSIGNED NOT NULL,
  creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  iniciado_en         DATETIME NULL,
  finalizado_en       DATETIME NULL,
  CONSTRAINT fk_sorteo_estado  FOREIGN KEY (estado_id)  REFERENCES estados_sorteo(id),
  CONSTRAINT fk_sorteo_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  CONSTRAINT ck_sorteo_numeros CHECK (numeros_por_carton BETWEEN 1 AND 10),
  CONSTRAINT ck_sorteo_rango   CHECK (rango_max > rango_min),
  INDEX idx_sorteo_estado (estado_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 6. CARTONES Y SUS NUMEROS
--    Los numeros del carton viven en su propia tabla: evita el grupo
--    repetitivo numero_1..numero_10 (1FN) y permite cantidad variable.
-- ---------------------------------------------------------------------------

CREATE TABLE cartones (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo           VARCHAR(20)  NOT NULL UNIQUE,   -- ej: S0001-C000123
  token_validacion CHAR(32)     NULL,              -- token del QR del PDF
  sorteo_id        INT UNSIGNED NOT NULL,
  jugador_id       INT UNSIGNED NOT NULL,
  vendedor_id      INT UNSIGNED NOT NULL,
  estado_id        TINYINT UNSIGNED NOT NULL,
  estado_pago_id   TINYINT UNSIGNED NOT NULL,
  habilitado       TINYINT(1) NOT NULL DEFAULT 0,
  cantidad_numeros TINYINT UNSIGNED NOT NULL,
  aciertos         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  habilitado_en    DATETIME NULL,
  pdf_archivo      VARCHAR(255) NULL,              -- PDF emitido para este carton
  pdf_generado_en  DATETIME NULL,
  CONSTRAINT fk_carton_sorteo     FOREIGN KEY (sorteo_id)      REFERENCES sorteos(id)    ON DELETE CASCADE,
  CONSTRAINT fk_carton_jugador    FOREIGN KEY (jugador_id)     REFERENCES jugadores(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_carton_vendedor   FOREIGN KEY (vendedor_id)    REFERENCES vendedores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_carton_estado     FOREIGN KEY (estado_id)      REFERENCES estados_carton(id),
  CONSTRAINT fk_carton_estadopago FOREIGN KEY (estado_pago_id) REFERENCES estados_pago(id),
  INDEX idx_carton_sorteo  (sorteo_id),
  INDEX idx_carton_jugador (jugador_id),
  UNIQUE KEY uq_carton_token (token_validacion),
  INDEX idx_carton_vendedor(vendedor_id)
) ENGINE=InnoDB;

CREATE TABLE carton_numeros (
  carton_id   INT UNSIGNED NOT NULL,
  numero      SMALLINT UNSIGNED NOT NULL,
  posicion    TINYINT UNSIGNED NOT NULL,  -- orden de lectura 1..N
  celda       TINYINT UNSIGNED NULL,      -- casillero 1..30 en la grilla 3x10
  PRIMARY KEY (carton_id, numero),
  UNIQUE KEY uq_carton_posicion (carton_id, posicion),
  UNIQUE KEY uq_carton_celda (carton_id, celda),
  CONSTRAINT fk_cartonnum_carton FOREIGN KEY (carton_id)
    REFERENCES cartones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Comprobantes de rendicion del vendedor (subidos con multer)
CREATE TABLE comprobantes (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  carton_id       INT UNSIGNED NOT NULL,
  subido_por      INT UNSIGNED NOT NULL,
  nombre_archivo  VARCHAR(255) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  tamano_bytes    INT UNSIGNED NOT NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comprobante_carton  FOREIGN KEY (carton_id)  REFERENCES cartones(id) ON DELETE CASCADE,
  CONSTRAINT fk_comprobante_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 7. JORNADAS Y NUMEROS EXTRAIDOS
--    Una jornada = una fecha de sorteo. Los numeros cuelgan de la jornada.
-- ---------------------------------------------------------------------------

CREATE TABLE jornadas (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sorteo_id     INT UNSIGNED NOT NULL,
  fecha         DATE NOT NULL,
  nombre        VARCHAR(40) NOT NULL DEFAULT 'Nocturna',  -- loteria de origen
  numero_sorteo INT UNSIGNED NULL,                        -- nro de sorteo de la quiniela
  cerrada     TINYINT(1) NOT NULL DEFAULT 0,
  creado_por  INT UNSIGNED NOT NULL,
  creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jornada_sorteo  FOREIGN KEY (sorteo_id)  REFERENCES sorteos(id) ON DELETE CASCADE,
  CONSTRAINT fk_jornada_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  UNIQUE KEY uq_jornada (sorteo_id, fecha)
) ENGINE=InnoDB;

CREATE TABLE numeros_extraidos (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  jornada_id    INT UNSIGNED NOT NULL,
  numero        SMALLINT UNSIGNED NOT NULL,   -- dos ultimas cifras: valida los cartones
  valor_cargado SMALLINT UNSIGNED NULL,       -- valor de hasta 4 cifras que cargo el admin
  cuenta        TINYINT(1) NOT NULL DEFAULT 1, -- 0 = repetido o fuera de rango: no valida
  orden         SMALLINT UNSIGNED NOT NULL,    -- posicion en el sorteo (1..20)
  creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_extraido_jornada FOREIGN KEY (jornada_id)
    REFERENCES jornadas(id) ON DELETE CASCADE,
  -- No hay UNIQUE sobre (jornada_id, numero): en la quiniela dos posiciones
  -- pueden terminar en las mismas dos cifras.
  UNIQUE KEY uq_extraido_jornada_orden (jornada_id, orden),
  INDEX idx_extraido_numero (jornada_id, numero, cuenta)
) ENGINE=InnoDB;

-- La unicidad del numero dentro de TODO el sorteo se valida en la capa de
-- servicio (sorteo.service.js), porque abarca varias jornadas del sorteo.

CREATE TABLE ganadores (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sorteo_id    INT UNSIGNED NOT NULL,
  carton_id    INT UNSIGNED NOT NULL,
  jornada_id   INT UNSIGNED NOT NULL,
  posicion     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  creado_en    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ganador_sorteo  FOREIGN KEY (sorteo_id)  REFERENCES sorteos(id)  ON DELETE CASCADE,
  CONSTRAINT fk_ganador_carton  FOREIGN KEY (carton_id)  REFERENCES cartones(id) ON DELETE CASCADE,
  CONSTRAINT fk_ganador_jornada FOREIGN KEY (jornada_id) REFERENCES jornadas(id) ON DELETE CASCADE,
  UNIQUE KEY uq_ganador_carton (carton_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 8. MENSAJERIA WHATSAPP (auditoria de envios)
-- ---------------------------------------------------------------------------

CREATE TABLE mensajes_whatsapp (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tipo_mensaje_id   TINYINT UNSIGNED NOT NULL,
  estado_envio_id   TINYINT UNSIGNED NOT NULL,
  jugador_id        INT UNSIGNED NULL,
  carton_id         INT UNSIGNED NULL,
  destino           VARCHAR(25)  NOT NULL,
  contenido         TEXT         NOT NULL,
  error_detalle     TEXT         NULL,
  intentos          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  creado_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_en        DATETIME NULL,
  CONSTRAINT fk_msg_tipo    FOREIGN KEY (tipo_mensaje_id) REFERENCES tipos_mensaje(id),
  CONSTRAINT fk_msg_estado  FOREIGN KEY (estado_envio_id) REFERENCES estados_envio(id),
  CONSTRAINT fk_msg_jugador FOREIGN KEY (jugador_id)      REFERENCES jugadores(id) ON DELETE SET NULL,
  CONSTRAINT fk_msg_carton  FOREIGN KEY (carton_id)       REFERENCES cartones(id)  ON DELETE SET NULL,
  INDEX idx_msg_estado (estado_envio_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 9. VISTAS DE APOYO
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sorteo_progreso AS
SELECT s.id                AS sorteo_id,
       s.numero            AS sorteo_numero,
       s.nombre,
       es.codigo           AS estado,
       s.cartones_objetivo,
       COUNT(c.id)         AS cartones_vendidos,
       GREATEST(CAST(s.cartones_objetivo AS SIGNED) - CAST(COUNT(c.id) AS SIGNED), 0) AS cartones_faltantes
FROM sorteos s
JOIN estados_sorteo es ON es.id = s.estado_id
LEFT JOIN cartones c
       ON c.sorteo_id = s.id
      AND c.estado_id <> (SELECT id FROM estados_carton WHERE codigo = 'ANULADO')
GROUP BY s.id, s.numero, s.nombre, es.codigo, s.cartones_objetivo;

CREATE OR REPLACE VIEW v_numeros_sorteo AS
SELECT j.sorteo_id, j.id AS jornada_id, j.fecha, j.nombre, j.numero_sorteo,
       ne.orden AS posicion, ne.valor_cargado, ne.numero, ne.cuenta
FROM jornadas j
JOIN numeros_extraidos ne ON ne.jornada_id = j.id;
