# Despliegue en el VPS (nginx + PM2)

Archivos de este directorio:

| Archivo | Para qué |
|---------|----------|
| `nginx/dgggestion.com.conf` | **Sitio listo para este VPS**: dominio, rutas y puerto 5006 ya puestos |
| `nginx/bingodgg.conf` | El mismo sitio con valores genéricos, para otro despliegue |
| `ecosystem.config.cjs` | Proceso de la API en PM2 |

La configuración de MySQL está en [../docs/08-produccion.md](../docs/08-produccion.md).

---

## 1. Diagnosticar el 500 primero

Si nginx devuelve **500 Internal Server Error** con su propia página
(`nginx/1.18.0 (Ubuntu)`), el error es de nginx, no de la aplicación — el log de
PM2 muestra la API sana, escuchando y con MySQL conectado.

El motivo exacto está en el log de errores. **Mirá eso antes de cambiar nada:**

```bash
sudo tail -n 50 /var/log/nginx/error.log
```

Las causas habituales, y cómo se ven ahí:

| En el log dice | Qué pasa | Solución |
|----------------|----------|----------|
| `rewrite or internal redirection cycle` | `try_files` en bucle (por ejemplo `try_files $uri /index.html` sin que `index.html` exista) | Compilar el frontend: `cd frontend && npm run build` |
| `failed (13: Permission denied)` | `www-data` no puede leer `dist/` o recorrer la ruta | Ver *Permisos* abajo |
| `no live upstreams` / `connect() failed` | El `proxy_pass` apunta a un puerto donde no hay nada | Que el `upstream` coincida con `PORT` de `backend/.env` (hoy **5006**) |
| `open() ... failed (2: No such file)` | El `root` apunta a una carpeta que no existe | Corregir `root` en el `.conf` |
| nada nuevo en el log | nginx no está atendiendo ese dominio | Revisar `server_name` y que el sitio esté habilitado |

> Un `proxy_pass` a un puerto cerrado normalmente da **502**, no 500. Un 500
> propio de nginx apunta más a un ciclo de `try_files` o a permisos: las dos
> primeras filas de la tabla.

---

## 1.bis Qué estaba mal en el archivo actual

La configuración que había en `/etc/nginx/sites-available/dgggestion.com.conf`:

```nginx
server {
  listen 80;
  server_name dgggestion.com www.dgggestion.com;
  location /api {
    root /var/www/proyectos-mysql/gestiongerman/frontend/dist;
    try_files $uri /index.html;
  }
}
```

Dos fallas, las dos de fondo:

1. **`/api` servía archivos estáticos en lugar de ir al backend.** No hay ningún
   `proxy_pass`, así que el proceso de Node del puerto 5006 nunca se alcanzaba:
   nginx buscaba un archivo llamado `api` dentro de `dist/` y, al no
   encontrarlo, redirigía internamente a `/index.html`.
2. **No había `location /` ni `root` a nivel de server.** La raíz del sitio no
   tenía de dónde servirse, y el `/index.html` del `try_files` caía en una
   ubicación sin `root` definido — de ahí el 500 en lugar de un 404 prolijo.

Usá [`nginx/dgggestion.com.conf`](nginx/dgggestion.com.conf), que ya viene con
el dominio, la ruta y el puerto de este VPS.

## 2. Instalar la configuración

```bash
# 1. Compilar el frontend (si falta dist/, nginx no tiene nada que servir)
cd /var/www/proyectos-mysql/gestiongerman/frontend
npm ci
npm run build            # deja frontend/dist/
ls -la dist/index.html   # tiene que existir

# 2. Respaldar el archivo actual y poner el corregido
sudo cp /etc/nginx/sites-available/dgggestion.com.conf \
        /etc/nginx/sites-available/dgggestion.com.conf.bak

sudo cp /var/www/proyectos-mysql/gestiongerman/deploy/nginx/dgggestion.com.conf \
        /etc/nginx/sites-available/dgggestion.com.conf

# 3. Que esté habilitado
sudo ln -sf /etc/nginx/sites-available/dgggestion.com.conf /etc/nginx/sites-enabled/

# 4. Validar la sintaxis ANTES de recargar
sudo nginx -t

# 5. Recargar (recargar no corta las conexiones; reiniciar sí)
sudo systemctl reload nginx
```

## 3. Permisos

nginx corre como `www-data` y necesita **recorrer toda la ruta** hasta `dist`,
no sólo leer la carpeta final. Si el proyecto está en `/root/...` o en un home
con permisos `700`, nunca va a funcionar: movelo a `/var/www`.

```bash
sudo chown -R tu_usuario:www-data /var/www/proyectos-mysql/gestiongerman
sudo chmod -R 755 /var/www/proyectos-mysql/gestiongerman/frontend/dist

# Verificar que www-data realmente puede leer el index:
sudo -u www-data test -r /var/www/proyectos-mysql/gestiongerman/frontend/dist/index.html \
  && echo "OK: www-data puede leerlo" \
  || echo "FALLA: problema de permisos en la ruta"
```

`backend/uploads/` lo escribe el proceso de Node, no nginx, así que su dueño
tiene que ser el usuario que corre PM2:

```bash
sudo chown -R tu_usuario:tu_usuario /var/www/proyectos-mysql/gestiongerman/backend/uploads
sudo chmod 600 /var/www/proyectos-mysql/gestiongerman/backend/.env
```

## 4. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dgggestion.com -d www.dgggestion.com
```

Certbot edita `bingodgg.conf`, agrega el bloque del puerto 443 y la redirección
desde el 80. No hay que escribir nada a mano.

**Después de activar HTTPS, actualizar `backend/.env`:**

```ini
APP_URL=https://dgggestion.com
CORS_ORIGIN=https://dgggestion.com
```

Esto no es cosmético: `APP_URL` es la base del **QR del cartón** y del **enlace
al PDF** que se manda por WhatsApp. Si quedó en `http://localhost:5173`, los QR
impresos apuntan a la máquina del jugador y no abren nada.

```bash
pm2 reload bingodgg-api      # para que tome el .env nuevo
```

Los PDFs ya emitidos conservan el QR viejo. Para reemitirlos con la URL
correcta: botón **PDF** en `/admin/cartones`, o
`POST /api/jugadores/cartones/:id/pdf`.

## 5. La API con PM2

```bash
cd /var/www/proyectos-mysql/gestiongerman
pm2 delete dgggesti 2>/dev/null || true     # el proceso anterior, si lo hubiera
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup                                  # ejecutar la línea que imprime
```

```bash
pm2 logs bingodgg-api --lines 50
pm2 status
```

Arranque correcto:

```
MySQL conectado (bingodgg@localhost)
WhatsApp deshabilitado (WA_ENABLED=false): los mensajes sólo se registran
API escuchando en http://localhost:5006/api
```

Ese aviso de WhatsApp es **esperado**: el chatbot está desconectado a propósito
y los cartones los manda cada vendedor desde su teléfono.

## 6. Comprobar que quedó bien

```bash
# La API responde directo
curl -s http://127.0.0.1:5006/api/salud

# La API responde a través de nginx
curl -s https://dgggestion.com/api/salud
# -> {"ok":true,"data":{"servicio":"bingodgg-api"}}

# La SPA se sirve
curl -sI https://dgggestion.com/ | head -3

# Una ruta interna de React devuelve index.html, no 404
curl -sI https://dgggestion.com/validar/abc | head -3

# Que index.html NO se cachee (si no, los deploys dejan la app en blanco)
curl -sI https://dgggestion.com/ | grep -i cache-control
```

---

## Qué resuelve esta configuración

- **`/api` proxyeado al puerto correcto**, declarado una sola vez en `upstream`.
- **`X-Forwarded-For`** hacia el backend. Sin esto, Express veía `127.0.0.1`
  como IP de todos los pedidos y el límite de 20 logins cada 15 minutos era
  **global**: el intento 21 de cualquiera bloqueaba a todos. El backend la lee
  gracias a `TRUST_PROXY=1`.
- **`client_max_body_size 10m`**. El default de nginx es 1 MB y multer acepta
  5 MB, así que los comprobantes de más de 1 MB fallaban con 413 antes de
  llegar a la aplicación.
- **Fallback de la SPA** a `index.html`, para que `/validar/:token`,
  `/jugador/cartones/5` y el resto funcionen al entrar directo o al recargar.
- **`index.html` sin caché y `/assets/` cacheado para siempre**: los nombres de
  Vite llevan hash, así que son inmutables, pero el HTML que los referencia
  tiene que pedirse siempre o un deploy deja la app apuntando a archivos que ya
  no existen.
- **gzip** sobre el bundle (~320 KB → ~148 KB).
