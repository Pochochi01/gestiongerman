-- ============================================================================
--  Migración 006 · Varios administradores
--
--  Hasta ahora había un solo administrador: una fila de `usuarios` con rol
--  ADMIN, creada por `npm run seed:admin` y sin datos personales. Ahora ese
--  administrador puede crear otros, con su alta, baja, edición y blanqueo de
--  clave.
--
--  Se agrega:
--    · `usuarios.es_raiz`: marca la cuenta fundadora. Es la única que los
--      administradores nuevos no pueden ver ni tocar.
--    · tabla `administradores`: los datos personales de cada administrador
--      nuevo, igual que `vendedores` pero sin teléfono ni domicilio.
--
--  Por qué el administrador raíz NO tiene fila en `administradores`:
--  el CRUD trabaja sobre esa tabla, así que una cuenta que no está ahí es
--  inalcanzable por id — no hace falta confiar en que un filtro se aplique en
--  todas las consultas. `es_raiz` queda además como segundo cerrojo en el
--  servicio, y para que el propósito de la cuenta esté escrito en el esquema.
--
--  Aplicar:  npm run migrar:administradores      (idempotente)
-- ============================================================================
USE bingodgg;

-- ---------------------------------------------------------------------------
--  1. La marca de la cuenta fundadora
-- ---------------------------------------------------------------------------
ALTER TABLE usuarios
  ADD COLUMN es_raiz TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Cuenta fundadora: invisible e intocable para los demas administradores'
  AFTER activo;

-- En este punto hay exactamente un ADMIN (el del seed), que es el fundador.
-- Se marca por el id mas bajo, que es el unico criterio disponible en SQL
-- puro; el script de Node usa ADMIN_USERNAME del .env, que es mas preciso.
UPDATE usuarios u
   JOIN roles r ON r.id = u.rol_id
    SET u.es_raiz = 1
  WHERE r.codigo = 'ADMIN'
  ORDER BY u.id
  LIMIT 1;

-- ---------------------------------------------------------------------------
--  2. Datos personales de los administradores nuevos
-- ---------------------------------------------------------------------------
CREATE TABLE administradores (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id     INT UNSIGNED NOT NULL UNIQUE,
  apellido       VARCHAR(80) NOT NULL,
  nombre         VARCHAR(80) NOT NULL,
  dni            VARCHAR(15) NOT NULL UNIQUE,
  creado_por     INT UNSIGNED NULL
                 COMMENT 'Usuario que lo dio de alta; queda NULL si esa cuenta se elimina',
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_administrador_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_administrador_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
