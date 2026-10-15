# DGG Gestión

Sistema de bingo con venta de cartones por vendedores, sorteo diario validado
automáticamente y envío de cartones por WhatsApp.

Arquitectura **MVC**: modelos (acceso a MySQL), controladores (HTTP), vistas
(SPA en React) y una capa de **servicios** donde vive la lógica de negocio.

| Capa | Tecnología |
|------|------------|
| Backend | Node.js + Express (MVC) |
| Frontend | React + Vite + TailwindCSS |
| Base de datos | MySQL 8+ (normalizada hasta 3FN) |
| Autenticación | JWT (`jsonwebtoken`) |
| HTTP cliente | axios |
| WhatsApp | Enlace `wa.me` desde el teléfono del vendedor · Baileys disponible pero desconectado |
| PDF / QR | pdfkit + qrcode |
| Archivos | multer |

> El sistema **no usa mapas ni geolocalización**: Leaflet se desinstaló en la
> migración 005. El domicilio del vendedor quedó como texto simple.

---

## Puesta en marcha

### 1. Base de datos

```bash
cd backend
cp .env.example .env      # completar DB_USER / DB_PASSWORD
npm install
npm run db:install        # crea la base, aplica schema.sql y seed.sql
npm run seed:admin        # crea el usuario administrador del .env
```

Alternativa manual:

```bash
mysql -u root -p < backend/database/schema.sql
mysql -u root -p bingodgg < backend/database/seed.sql
```

### 2. Backend

```bash
cd backend
npm run dev               # puerto según PORT en backend/.env
```

> **Puerto.** En este equipo el 4000 ya estaba ocupado por otra aplicación, así
> que `backend/.env` quedó con `PORT=4001` y `frontend/.env` con
> `VITE_PROXY_TARGET=http://localhost:4001`. Si liberás el 4000, cambiá **los
> dos** valores. Si el puerto está tomado, el servidor ahora lo informa con un
> mensaje claro en vez de un stack trace.

#### WhatsApp

Los cartones los envía **cada vendedor desde su propio WhatsApp**: al guardar un
jugador, el sistema abre la app con el mensaje ya escrito. No hace falta
vincular ningún teléfono al servidor.

El **chatbot de Baileys queda desconectado** (`WA_ENABLED=false`) pero entero:
el código, la sesión guardada en `backend/session.json` y el panel
`/admin/whatsapp` siguen en su lugar. Para reactivarlo, poner `WA_ENABLED=true`
y reiniciar; la primera vez pide escanear un QR desde `/admin/whatsapp`.

Mientras esté apagado, los avisos automáticos (cartón habilitado, números del
día, ganadores) se registran en `mensajes_whatsapp` pero **no se envían**.

> `session.json` contiene credenciales: está en `.gitignore` y no debe
> compartirse.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # ajustar VITE_PROXY_TARGET al puerto de la API
npm run dev               # http://localhost:5173
```

### Credenciales

| Rol | Usuario | Clave inicial |
|-----|---------|---------------|
| Administrador | el de `ADMIN_USERNAME` (por defecto `admin`) | el de `ADMIN_PASSWORD` |
| Vendedor | su DNI | su DNI |
| Jugador | su DNI | su DNI |

---

## Estructura

```
DGG Gestión/
├── backend/
│   ├── database/
│   │   ├── schema.sql          # esquema 3FN
│   │   └── seed.sql            # catálogos y geografía inicial
│   ├── scripts/                # install-db.js, seed-admin.js
│   └── src/
│       ├── config/             # env.js, db.js (pool + transacciones)
│       ├── models/             # M: consultas SQL por entidad
│       ├── controllers/        # C: request/response
│       ├── services/           # reglas de negocio (sorteo, cartón, WhatsApp)
│       ├── routes/             # definición de endpoints + validaciones
│       ├── middlewares/        # auth (JWT), errores, multer, validación
│       ├── utils/              # ApiError, helpers, logger
│       ├── app.js              # configuración de Express
│       └── server.js           # arranque
└── frontend/
    └── src/
        ├── api/                # cliente axios + endpoints
        ├── components/         # V: mapa, cartón, selector de números, UI
        ├── context/            # sesión (AuthContext)
        ├── layouts/            # estructura y menú por rol
        └── pages/              # admin/, vendedor/, jugador/
```

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/01-arquitectura.md](docs/01-arquitectura.md) | Capas MVC, responsabilidades y dependencias |
| [docs/02-base-de-datos.md](docs/02-base-de-datos.md) | Modelo de datos y justificación de la 3FN |
| [docs/03-modulos.md](docs/03-modulos.md) | Los 5 módulos del sistema, pantalla por pantalla |
| [docs/04-flujo-de-datos.md](docs/04-flujo-de-datos.md) | Los 8 pasos del flujo, de punta a punta |
| [docs/05-api.md](docs/05-api.md) | Referencia de todos los endpoints |
| [docs/06-whatsapp.md](docs/06-whatsapp.md) | Integración Baileys y plantillas de mensajes |
| [docs/07-seguridad.md](docs/07-seguridad.md) | JWT, roles y controles de acceso |
| [docs/08-produccion.md](docs/08-produccion.md) | **Poner la base en producción en un VPS**: instalación, usuario dedicado, zona horaria, backups |

---

## Prueba del flujo completo

Con la API levantada:

```bash
cd backend
npm run test:e2e
```

Recorre los 8 pasos del flujo (alta de sorteo y vendedor → registro de jugador →
venta de cartones → inicio automático del sorteo → carga de números → detección
del ganador → consulta del jugador) y verifica además los controles de rol y la
inhabilitación de vendedores.

> Genera datos de prueba en la base indicada en `.env`: conviene apuntarlo a una
> base de desarrollo, no a la productiva.

### Prueba de la persistencia de la sesión de WhatsApp

```bash
cd backend
npm run test:sesion
```

No toca WhatsApp: verifica que `session.json` se escriba y se relea tal cual
(incluidos los Buffers de las claves), que un archivo corrupto se respalde y que
la desvinculación lo elimine.

### Prueba de la disposición del cartón

```bash
cd backend
npm run test:carton
```

Verifica la grilla de 3 x 10: sin casilleros repetidos, números en orden
ascendente de lectura y reparto parejo entre filas.

### Prueba de la carga por quiniela

```bash
cd backend
npm run test:quiniela
```

Verifica que los valores de 4 cifras se traduzcan a sus dos últimas, que la
jornada registre fecha + 'Nocturna' + número de sorteo, y que los repetidos se
ignoren con su motivo en lugar de rechazar la carga. Crea su propio escenario y
lo borra al terminar.

> Si cambiaste la clave de `admin`, los scripts `test:e2e` y `test:quiniela`
> aceptan `ADMIN_USER` y `ADMIN_PASS` por variable de entorno.

### Prueba de las posiciones del sorteo

```bash
cd backend
npm run test:posiciones
```

Carga un sorteo de 20 posiciones con valores repetidos intercalados y verifica
que las 20 queden guardadas sin huecos, que cada una conserve su valor, que los
repetidos ocupen su posición sin contar para los cartones y que el jugador vea
la grilla completa.

---

## Simulación con datos reales

```bash
cd backend
npm run seed:simulacion     # 500 cartones, 5 vendedores, sorteos Nocturna
npm run seed:limpiar        # borra todo lo que generó
```

La simulación deja en la base un bingo completo, generado **a través de los
servicios reales** (venta, carga de números, validación de cartones):

- 5 vendedores con domicilio y geolocalización
- 500 cartones entre ~250 jugadores, con 1, 2 o 3 cartones cada uno
- números de cartón al azar dentro del rango del sorteo
- sorteos **Nocturna** en fechas correlativas, 20 posiciones de 4 cifras por
  día, todas al azar, hasta que aparece el primer ganador
- una parte de los cartones habilitada y otra rendida, para que los estados de
  pago no queden todos en IMPAGO

Los números de WhatsApp son inventados, así que corre en modo simulado: los
mensajes quedan **registrados** en `mensajes_whatsapp` pero no se envían. Los
avisos masivos (inicio de sorteo y números del día) se silencian para no cargar
miles de filas sin valor.

Reconoce lo simulado por el prefijo `SIM`, así que `seed:limpiar` no toca los
datos reales. Con `SIM_CARTONES=50` se puede correr una versión chica.

### Prueba de la gestión de sorteos

```bash
cd backend
npm run test:gestion
```

Verifica el detalle del sorteo con vendedores y resumen, el filtro por vendedor,
las reglas del `PATCH /cartones/:id`, el resumen por sorteo del vendedor y los
controles de acceso.

> **Correr la suite sin tocar los datos reales.** Los tests que venden cartones
> necesitan abrir una venta, y el sistema admite un solo sorteo `EN_VENTA` a la
> vez: si hay uno real abierto, fallan. Para una corrida limpia, usar una base
> aparte:
>
> ```bash
> DB_NAME=bingodgg_test npm run db:install
> DB_NAME=bingodgg_test npm run seed:admin
> DB_NAME=bingodgg_test npm run dev          # en otra terminal
> DB_NAME=bingodgg_test npm run test:e2e
> ```

### Prueba del PDF, el QR y el color por sorteo

```bash
cd backend
npm run test:pdf
```

Cubre los cinco casos: el vendedor obtiene PDF + enlace de WhatsApp, el
administrador sólo PDF, los cartones de un sorteo comparten color, el color
cambia al cambiar de sorteo, y el QR valida contra el endpoint público.
Verifica el contenido del PDF leyendo el archivo (textos y colores), sin
necesidad de un renderizador.
