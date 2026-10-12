# 08 · La base de datos en producción (VPS)

Guía para dejar MySQL andando en un VPS con este sistema. Pensada para Ubuntu/Debian;
en otra distro cambian los comandos de paquetes, no los pasos.

---

## 0. Requisito de versión: MySQL 8.0.16 o superior

No es opcional. El esquema usa **restricciones `CHECK`**, que MySQL ignora
silenciosamente antes de 8.0.16:

```sql
CONSTRAINT ck_sorteo_numeros CHECK (numeros_por_carton BETWEEN 1 AND 10),
CONSTRAINT ck_sorteo_rango   CHECK (rango_max > rango_min),
```

En MySQL 5.7 el sistema arranca igual, pero esas dos reglas dejan de existir y la
base acepta datos que el negocio prohíbe. MariaDB también sirve (10.2+), aunque
no está probado acá.

```bash
mysql --version    # debe decir 8.0.16 o mayor
```

---

## 1. Instalar y asegurar MySQL

```bash
sudo apt update && sudo apt install -y mysql-server
sudo mysql_secure_installation      # poné clave a root, quitá usuarios anónimos y la base test
```

**Que no escuche en Internet.** Es lo más importante de seguridad: la API corre
en el mismo VPS, así que MySQL sólo necesita el loopback.

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

```ini
[mysqld]
bind-address = 127.0.0.1
```

```bash
sudo systemctl restart mysql
ss -lntp | grep 3306        # debe mostrar 127.0.0.1:3306, nunca 0.0.0.0:3306
```

Si el firewall está activo, el puerto 3306 **no** se abre:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

---

## 2. Zona horaria: el detalle que rompe las fechas del sorteo

Las jornadas se guardan como `DATE` y el sistema toma **la fecha local del
servidor** cuando el administrador no manda una explícita
(`utils/helpers.aFechaISO`). Un VPS configurado en UTC, a las 21:30 de Argentina,
ya está en el día siguiente: la jornada quedaría con la fecha de mañana.

```bash
sudo timedatectl set-timezone America/Argentina/Buenos_Aires
timedatectl                 # verificá "Time zone"
```

Y que MySQL use la misma hora que el sistema:

```sql
SELECT @@global.time_zone, @@session.time_zone, NOW();
```

Si `NOW()` no coincide con la hora local, en `mysqld.cnf`:

```ini
[mysqld]
default-time-zone = '-03:00'
```

> El pool de la aplicación ya usa `timezone: 'local'` y `dateStrings` para las
> fechas, así que alineando servidor y MySQL queda consistente.

---

## 3. Usuario de base dedicado (no root)

La aplicación **nunca** debe conectarse como root.

```sql
CREATE DATABASE bingodgg
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER 'bingo_app'@'localhost' IDENTIFIED BY 'una-clave-larga-y-aleatoria';

-- Lo que la aplicación necesita en el día a día.
GRANT SELECT, INSERT, UPDATE, DELETE ON bingodgg.* TO 'bingo_app'@'localhost';
FLUSH PRIVILEGES;
```

El usuario de la app **no necesita** `CREATE`, `DROP` ni `ALTER`: si no los
tiene, un error de configuración no puede borrar tablas. Para instalar el
esquema y para las migraciones se usa root (o un usuario de mantenimiento) una
sola vez, a mano.

---

## 4. Crear el esquema

### Instalación nueva

`database/schema.sql` **ya contiene las cinco migraciones aplicadas**. En una
base nueva no hay que correr ningún script de migración.

```bash
cd backend
cp .env.example .env     # completá los valores (ver paso 5)
npm ci --omit=dev
npm run db:install       # aplica schema.sql + seed.sql
npm run seed:admin       # crea el usuario administrador del .env
```

> `db:install` se niega a correr si la base ya tiene tablas, y dice qué hacer en
> su lugar. Para rehacerla desde cero hay que pedirlo explícitamente con
> `npm run db:install -- --forzar`, **que borra todo**.

Alternativa manual, si preferís no darle credenciales de root a Node:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p bingodgg < database/seed.sql
```

### Actualizar una base que ya está en uso

Nunca con `db:install`. Las migraciones son idempotentes y van en orden:

```bash
npm run migrar:celdas       # 001  disposición del cartón (grilla 3x10)
npm run migrar:nocturna     # 002  carga por quiniela (4 cifras)
npm run migrar:posiciones   # 003  posiciones 1..20 del sorteo
npm run migrar:pdf          # 004  PDF, QR y color por sorteo
npm run migrar:sin-geo      # 005  se quita la geolocalización (IRREVERSIBLE)
```

Antes de cada migración, **backup**. La 005 borra coordenadas y no se puede
deshacer.

---

## 5. Variables de entorno

`backend/.env` en el VPS:

```ini
NODE_ENV=production
PORT=4000

# URL pública del frontend. Va dentro del QR y de los enlaces al PDF,
# así que tiene que ser la real, no localhost.
APP_URL=https://bingo.tudominio.com
CORS_ORIGIN=https://bingo.tudominio.com

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=bingo_app
DB_PASSWORD=la-clave-del-paso-3
DB_NAME=bingodgg
DB_CONNECTION_LIMIT=10

# Obligatorio: con el valor de desarrollo, en producción el server no arranca.
JWT_SECRET=<openssl rand -hex 48>
JWT_EXPIRES_IN=8h

ADMIN_USERNAME=admin
ADMIN_PASSWORD=<una clave fuerte, cambiala al primer ingreso>

WA_ENABLED=false
WA_SESSION_FILE=./session.json

UPLOAD_DIR=./uploads
UPLOAD_MAX_MB=5
```

Generar el secreto:

```bash
openssl rand -hex 48
```

`src/config/env.js` **aborta el arranque** si `NODE_ENV=production` y
`JWT_SECRET` quedó en el valor de desarrollo. Es a propósito: con el secreto por
defecto cualquiera puede firmarse un token de administrador.

Permisos del archivo, que tiene la clave de la base:

```bash
chmod 600 backend/.env
```

---

## 6. Backups (esto es lo que te salva)

### Automático, diario

```bash
sudo mkdir -p /var/backups/bingodgg
sudo nano /usr/local/bin/backup-bingodgg.sh
```

```bash
#!/bin/bash
set -euo pipefail
FECHA=$(date +%F-%H%M)
DESTINO=/var/backups/bingodgg

mysqldump --single-transaction --routines --triggers --events \
  --default-character-set=utf8mb4 \
  -u root -p"$MYSQL_ROOT_PASS" bingodgg | gzip > "$DESTINO/bingodgg-$FECHA.sql.gz"

# Los PDFs y comprobantes viven en disco, no en la base.
tar czf "$DESTINO/uploads-$FECHA.tar.gz" -C /ruta/al/proyecto/backend uploads

# Retención: 14 días
find "$DESTINO" -name '*.gz' -mtime +14 -delete
```

```bash
sudo chmod 700 /usr/local/bin/backup-bingodgg.sh
sudo crontab -e
```

```cron
30 3 * * * MYSQL_ROOT_PASS='...' /usr/local/bin/backup-bingodgg.sh
```

`--single-transaction` hace el dump sin bloquear las tablas InnoDB: el sistema
sigue funcionando mientras corre.

### Probá la restauración

Un backup que nunca se restauró no es un backup:

```bash
mysql -u root -p -e "CREATE DATABASE bingodgg_restore"
gunzip -c /var/backups/bingodgg/bingodgg-FECHA.sql.gz | mysql -u root -p bingodgg_restore
mysql -u root -p -e "SELECT COUNT(*) FROM bingodgg_restore.cartones"
```

### Binlog: recuperación a un punto en el tiempo

Con el binario log activo se puede volver a cualquier instante, no sólo al
último backup. Sirve justamente para el caso "borré algo por error":

```ini
[mysqld]
log_bin = /var/log/mysql/mysql-bin
binlog_format = ROW
binlog_expire_logs_seconds = 1209600   # 14 días
```

Para reconstruir desde un backup más los binlogs:

```bash
# 1. Restaurar el último dump
gunzip -c bingodgg-FECHA.sql.gz | mysql -u root -p bingodgg

# 2. Reproducir lo que pasó después, SÓLO de esta base
mysqlbinlog --database=bingodgg --skip-gtids \
  --start-datetime="2026-10-12 03:30:00" \
  --stop-datetime="2026-10-12 14:05:00" \
  /var/log/mysql/mysql-bin.0000* | mysql -u root -p
```

> **`--database=bingodgg` no es opcional.** El binlog es de todo el servidor: si
> hay otras bases, reproducirlo sin filtrar les pasa por encima.

---

## 7. Puesta a punto del servidor MySQL

Para un VPS chico (2–4 GB de RAM), en `mysqld.cnf`:

```ini
[mysqld]
innodb_buffer_pool_size = 1G      # ~50-60% de la RAM si MySQL está solo
max_connections = 50              # DB_CONNECTION_LIMIT (10) + margen
innodb_flush_log_at_trx_commit = 1    # no bajar: 1 garantiza durabilidad
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
slow_query_log = 1
long_query_time = 1
```

`DB_CONNECTION_LIMIT=10` alcanza de sobra: la carga real es baja y las
operaciones pesadas (venta de cartón, carga de números) son transacciones
cortas.

---

## 8. Arranque permanente de la API

Con systemd (o PM2, si preferís):

```bash
sudo nano /etc/systemd/system/bingodgg.service
```

```ini
[Unit]
Description=BingoDGG API
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=bingo
WorkingDirectory=/ruta/al/proyecto/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bingodgg
sudo journalctl -u bingodgg -f
```

Si MySQL no está listo, el arranque falla con el mensaje de la base y systemd
reintenta a los 5 segundos.

---

## 9. Lo que vive en disco y no en la base

La base no es lo único que hay que respaldar:

| Ruta | Qué es | Si se pierde |
|------|--------|--------------|
| `backend/uploads/cartones/` | PDFs emitidos | Se regeneran solos al pedir el enlace |
| `backend/uploads/comprobantes/` | Comprobantes de rendición | **Se pierden**: no se pueden regenerar |
| `backend/session.json` | Sesión de WhatsApp (si se reactiva Baileys) | Hay que escanear el QR de nuevo |

Los PDFs se recuperan porque `GET /api/validar/:token/pdf` los vuelve a generar
si el archivo no está. Los comprobantes, no: son archivos que subió el vendedor.

---

## 10. Repaso antes de abrir al público

- [ ] `mysql --version` ≥ 8.0.16
- [ ] `ss -lntp | grep 3306` muestra sólo `127.0.0.1`
- [ ] `timedatectl` en la zona correcta y `NOW()` de MySQL coincide
- [ ] La app conecta con `bingo_app`, no con root
- [ ] `JWT_SECRET` generado al azar y `NODE_ENV=production`
- [ ] `APP_URL` con el dominio real (si no, los QR y los enlaces al PDF apuntan a localhost)
- [ ] `chmod 600 backend/.env`
- [ ] Clave del admin cambiada después del primer ingreso
- [ ] Backup diario andando **y restaurado una vez a modo de prueba**
- [ ] `log_bin` activo con retención
- [ ] HTTPS adelante (nginx + certbot): el JWT viaja en una cabecera

---

## Advertencias que ya costaron caro

**`npm run db:install` rehace la base desde cero.** `schema.sql` empieza con
`DROP DATABASE IF EXISTS`. El script ahora se niega si la base tiene tablas y
exige `--forzar`, pero en producción conviene no tenerlo a mano: usá
migraciones.

**`schema.sql` nombraba la base de forma fija.** Hasta este cambio,
`DB_NAME=otra npm run db:install` ignoraba la variable y borraba `bingodgg`.
Ahora el script sustituye el nombre por el de `DB_NAME`. Si alguna vez editás
los `.sql` a mano, acordate de que el nombre de la base aparece ahí dentro.

**El binlog es de todo el servidor.** Al recuperar, filtrá siempre con
`--database`.
