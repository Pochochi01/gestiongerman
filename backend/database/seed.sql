-- ============================================================================
--  BingoDGG - Datos iniciales (catalogos + admin)
--  Ejecutar DESPUES de schema.sql:  mysql -u root -p bingodgg < seed.sql
--  El usuario admin se crea con el script:  npm run seed:admin
-- ============================================================================
USE bingodgg;

INSERT INTO roles (codigo, nombre) VALUES
  ('ADMIN',    'Administrador'),
  ('VENDEDOR', 'Vendedor'),
  ('JUGADOR',  'Jugador');

INSERT INTO estados_sorteo (codigo, nombre) VALUES
  ('CONFIGURACION', 'En configuracion'),
  ('EN_VENTA',      'En venta de cartones'),
  ('EN_CURSO',      'Sorteo en curso'),
  ('FINALIZADO',    'Finalizado'),
  ('CANCELADO',     'Cancelado');

INSERT INTO estados_pago (codigo, nombre) VALUES
  ('IMPAGO',  'Impago'),
  ('RENDIDO', 'Rendido por el vendedor'),
  ('PAGADO',  'Pagado y habilitado');

INSERT INTO estados_carton (codigo, nombre) VALUES
  ('ACTIVO',  'Activo'),
  ('GANADOR', 'Ganador'),
  ('ANULADO', 'Anulado');

INSERT INTO tipos_mensaje (codigo, nombre) VALUES
  ('CARTON_NUEVO',      'Envio de carton al jugador'),
  ('CARTON_HABILITADO', 'Carton habilitado tras rendicion'),
  ('SORTEO_INICIADO',   'Aviso de inicio de sorteo'),
  ('NUMEROS_DIA',       'Numeros extraidos del dia'),
  ('GANADOR',           'Aviso de carton ganador');

INSERT INTO estados_envio (codigo, nombre) VALUES
  ('PENDIENTE', 'Pendiente de envio'),
  ('ENVIADO',   'Enviado'),
  ('ERROR',     'Error de envio');

-- Geografia minima de ejemplo
INSERT INTO provincias (nombre) VALUES ('Misiones'), ('Corrientes'), ('Buenos Aires');

INSERT INTO localidades (provincia_id, nombre, codigo_postal) VALUES
  (1, 'Posadas',      'N3300'),
  (1, 'Obera',        'N3360'),
  (1, 'Eldorado',     'N3380'),
  (2, 'Corrientes',   'W3400'),
  (3, 'La Plata',     'B1900');
