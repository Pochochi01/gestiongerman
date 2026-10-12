# 05 · API REST

Base: `http://localhost:4000/api`
Autenticación: `Authorization: Bearer <token>` en todo salvo `/auth/login` y `/salud`.

Respuestas:

```json
{ "ok": true,  "data": ... }
{ "ok": false, "error": "mensaje", "detalles": [{ "campo": "dni", "mensaje": "DNI invalido" }] }
```

Códigos: `400` datos inválidos · `401` sin token o expirado · `403` rol o estado
insuficiente · `404` inexistente · `409` conflicto de negocio · `500` error interno.

---

## Autenticación

| Método | Ruta | Rol | Cuerpo |
|--------|------|-----|--------|
| POST | `/auth/login` | — | `{ username, password }` |
| GET | `/auth/perfil` | cualquiera | — |
| PUT | `/auth/password` | cualquiera | `{ password_actual, password_nueva }` |

`POST /auth/login` devuelve `{ token, usuario, perfil }`. El token expira según
`JWT_EXPIRES_IN` (8 h por defecto).

---

## Vendedores · rol ADMIN

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/vendedores?q=&habilitado=` | Listado con búsqueda y filtro |
| GET | `/vendedores/:id` | Detalle (también accesible al propio vendedor) |
| POST | `/vendedores` | Alta + usuario |
| PUT | `/vendedores/:id` | Edición (el DNI no cambia) |
| PATCH | `/vendedores/:id/habilitacion` | `{ habilitado: true \| false }` |
| DELETE | `/vendedores/:id` | Sólo si no tiene jugadores |

```json
POST /vendedores
{
  "apellido": "Gomez", "nombre": "Ana", "dni": "30111222", "telefono": "3764111222",
  "domicilio": { "calle": "San Martin", "numero": "450" },
  "habilitado": true
}
```

---

## Jugadores · roles ADMIN y VENDEDOR

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/jugadores?q=` | Propios si el rol es VENDEDOR |
| GET | `/jugadores/:id` | El jugador puede ver el suyo |
| POST | `/jugadores` | Alta + usuario (+ cartón si manda `numeros`) |
| PUT | `/jugadores/:id` | Edición |

```json
POST /jugadores
{
  "apellido": "Perez", "nombre": "Juan", "dni": "40222333",
  "whatsapp": "3764 123456",
  "numeros": [3, 12, 25, 31, 44, 50, 61, 70, 77, 88]
}
```

Respuesta: `{ jugador, credenciales: { usuario, clave }, venta }`.
`venta` es `null` si no se enviaron números.

---

## Sorteos

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/sorteos` | cualquiera | Todos, con vendidos y faltantes |
| GET | `/sorteos/vigente` | cualquiera | El activo + jornadas + números salidos + ganadores |
| GET | `/sorteos/:id` | cualquiera | Igual, para un sorteo puntual |
| GET | `/sorteos/:id/jornadas` | cualquiera | Números agrupados por fecha |
| POST | `/sorteos` | ADMIN | Alta en CONFIGURACION |
| PUT | `/sorteos/:id` | ADMIN | Editar configuración |
| POST | `/sorteos/:id/abrir-venta` | ADMIN | → EN_VENTA |
| POST | `/sorteos/:id/iniciar` | ADMIN | → EN_CURSO (`{ forzado: true }` sin completar) |
| POST | `/sorteos/:id/numeros` | ADMIN | Carga diaria y validación |

```json
POST /sorteos
{ "nombre": "Bingo de octubre", "cartones_objetivo": 200,
  "numeros_por_carton": 10, "rango_min": 1, "rango_max": 90, "precio_carton": 5000 }

POST /sorteos/1/numeros
{ "fecha": "2026-10-05", "numero_sorteo": 9876,
  "numeros": ["1234", "0078", "5607"] }
```

Los números se cargan con **hasta 4 cifras** (como salen en la quiniela) y el
sistema valida los cartones con las **dos últimas**. La jornada queda registrada
con la fecha, el nombre de la lotería (`Nocturna`, fijo) y el número de sorteo.

Respuesta de la carga:

```json
{ "sorteo": { },
  "jornada": { "id": 7, "fecha": "2026-10-05", "nombre": "Nocturna", "numero_sorteo": 9876 },
  "fecha": "2026-10-05",
  "numeros": [34, 78],
  "cargados":  [{ "valor": 1234, "numero": 34 }, { "valor": 78, "numero": 78 }],
  "ignorados": [{ "valor": 5607, "numero": 7, "motivo": "ya habia salido en este sorteo" }],
  "ganadores": [ ], "finalizado": false }
```

`numeros` son las dos cifras que juegan; `cargados` incluye además el valor de 4
cifras que tipeó el administrador. Los repetidos y los que caen fuera del rango
se **ignoran con su motivo**, no rechazan la carga completa. Un valor de más de
4 cifras o no numérico sí devuelve 400.

---

## Cartones

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/cartones` | cualquiera | Filtrado por rol automáticamente |
| GET | `/cartones/:id` | dueño / su vendedor / ADMIN | Cartón pintado + sorteo + jornadas |
| POST | `/cartones` | ADMIN, VENDEDOR, JUGADOR | Vender: `{ jugador_id, numeros }` |
| PATCH | `/cartones/:id/habilitar` | ADMIN | Tras la rendición |
| PATCH | `/cartones/:id/rendir` | ADMIN, VENDEDOR | Marca RENDIDO |
| PATCH | `/cartones/:id/anular` | ADMIN | Libera el cupo (sólo en EN_VENTA) |
| POST | `/cartones/:id/comprobante` | ADMIN, VENDEDOR | `multipart/form-data`, campo `comprobante` |

Si el rol es JUGADOR, `jugador_id` se ignora y se usa el del token.

`GET /cartones/:id` devuelve:

```json
{ "carton": { "codigo": "S0001-C000123",
              "numeros": [{ "numero": 12, "salio": true }, { "numero": 45, "salio": false }],
              "aciertos": 1, "estado_pago": "IMPAGO", "habilitado": false },
  "sorteo": { }, "jornadas": [ ], "numeros_salidos": [12] }
```

---

## WhatsApp · rol ADMIN

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/whatsapp/estado` | Estado de la sesión + QR en base64 |
| GET | `/whatsapp/qr` | Sólo `{ qr, estado, mensaje }` |
| POST | `/whatsapp/vincular` | Fuerza la conexión para generar el QR |
| POST | `/whatsapp/desvincular` | Cierra sesión en el teléfono y borra `session.json` |
| POST | `/whatsapp/reintentar` | Reenvía pendientes y fallidos |
| GET | `/whatsapp/mensajes?limite=100` | Bandeja de salida |
| POST | `/whatsapp/cartones/:id/reenviar` | Reenvía a un jugador el mensaje con su cartón |

```json
GET /whatsapp/estado
{ "habilitado": true, "estado": "esperando_qr", "conectado": false,
  "telefono": null, "qr": "data:image/png;base64,iVBORw0...",
  "sesion_guardada": false, "archivo_sesion": "...\\backend\\session.json",
  "intentos_reconexion": 0, "reconectar_en": null, "ultimo_error": null,
  "mensaje": "Escanee el código QR desde WhatsApp > Dispositivos vinculados..." }
```

`estado` toma los valores `conectado`, `esperando_qr`, `conectando`,
`desconectado` o `deshabilitado`. Detalle completo en
[06-whatsapp](06-whatsapp.md).

## Salud

`GET /salud` — sin autenticación, para monitoreo.

---

## Resultados e historial

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/sorteos/historial?limite=10` | cualquiera | Últimos sorteos en los que participó quien consulta |
| GET | `/sorteos/:id/ranking?limite=20` | cualquiera | Cartones con más aciertos |
| GET | `/sorteos/:id/ganadores` | cualquiera | Ganadores con jugador, vendedor y cartón |
| POST | `/sorteos/:id/notificar-ganadores` | ADMIN | Avisa a todos los ganadores |
| POST | `/cartones/:id/notificar-habilitado` | ADMIN | Reenvía URL + credenciales |

`GET /sorteos/historial` (como JUGADOR):

```json
{ "limite": 10, "total": 1,
  "sorteos": [{
    "sorteo": { "numero": 2, "nombre": "SIM Bingo Nocturna", "estado": "FINALIZADO" },
    "jornadas": [ ], "numeros_salidos": [ ],
    "total_ganadores": 1,
    "ganadores": [{ "codigo": "S0002-C001512",
                    "jugador_apellido": "SIMCabrera", "jugador_nombre": "Lucia",
                    "vendedor_apellido": "SIMBenitez", "vendedor_telefono": "3764491442",
                    "gano_en": "2026-09-30", "numeros": [2, 27, 46] }],
    "ranking": [{ "puesto": 1, "codigo": "S0002-C001512", "aciertos": 10, "faltan": 0 }],
    "participacion": { "cartones": 3, "mejor_acierto": 10, "ganadores": 1 },
    "mis_cartones": [ ]
  }] }
```

El filtro de participación sale del **token**, no del query string: un jugador
sólo ve los sorteos en los que jugó.

`POST /sorteos/:id/notificar-ganadores`:

```json
{ "total_ganadores": 3, "enviados": 3,
  "detalle": [{ "carton": "S0002-C001512", "jugador": "Cabrera, Lucia",
                "destino": "5493764725905", "enviado": true, "mensaje_id": 1610 }] }
```

Devuelve 409 si el sorteo no tiene ganadores.
`POST /cartones/:id/notificar-habilitado` devuelve 409 si el cartón todavía no
está habilitado.

## Vendedores · borrado

`DELETE /vendedores/:id` sin jugadores borra directo. Con jugadores devuelve 409
y hay que repetir con **`?forzar=true`**, que arrastra sus jugadores y cartones:

```json
{ "mensaje": "Vendedor SIMSosa, Nadia eliminado junto con 56 jugador(es) y 111 carton(es)",
  "jugadores": 56, "cartones": 111 }
```

Resguardo: **no** se puede forzar si el vendedor tiene cartones en un sorteo
`EN_VENTA` o `EN_CURSO` — borrarlos liberaría cupos y alteraría un sorteo vivo.
En ese caso responde 409 indicando cuántos cartones lo impiden.

---

## Gestión de sorteos y cartones

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/sorteos/:id` | cualquiera | Datos completos + vendedores + resumen de estados |
| GET | `/sorteos/:id/cartones?vendedor=ID` | ADMIN, VENDEDOR | Cartones del sorteo, filtrables |
| PATCH | `/cartones/:id` | ADMIN | Cambia estado (habilitado / pagado / impago) |
| GET | `/vendedores/:id/cartones` | ADMIN, VENDEDOR | Resumen de vendidos por sorteo |

`GET /sorteos/:id` agrega al detalle:

```json
{ "resumen": { "total": 500, "impagos": 140, "rendidos": 60, "pagados": 300,
                "habilitados": 300, "ganadores": 1, "anulados": 0 },
  "vendedores": [{ "id": 32, "apellido": "Sosa", "nombre": "Nadia",
                   "cartones": 111, "impagos": 30, "rendidos": 12, "pagados": 69 }],
  "editable": false }
```

`editable` es `true` sólo con el sorteo en `EN_VENTA` o `EN_CURSO`.

`GET /sorteos/:id/cartones?vendedor=32`:

```json
{ "sorteo": { }, "editable": true, "vendedor_id": 32,
  "vendedores": [ ], "resumen": { "total": 111, "impagos": 30 },
  "total": 111, "cartones": [ ] }
```

El `resumen` acompaña al filtro: si se pide un vendedor, son sus cartones.
A un VENDEDOR se le **fuerza** el filtro a su propio perfil.

`PATCH /cartones/:id` — cambio de estado en una sola llamada:

```json
{ "habilitado": true }                          // cobra, habilita y avisa al jugador
{ "estado_pago": "RENDIDO" }                    // rindió, falta habilitar
{ "estado_pago": "PAGADO" }                     // pagado (habilita solo)
{ "estado_pago": "RENDIDO", "habilitado": false }
```

Reglas de coherencia que aplica el servicio:

| Pedido | Resultado |
|--------|-----------|
| `habilitado: true` sin estado | pasa a `PAGADO` |
| `estado_pago: PAGADO` | habilita |
| `estado_pago: IMPAGO` | deshabilita |
| `habilitado: false` desde `PAGADO` | vuelve a `RENDIDO` |

Al **pasar** a habilitado dispara el aviso de WhatsApp con la URL y las
credenciales (no en cada cambio). Si el cartón ya estaba en ese estado responde
`cambio: false` sin tocar nada. Reemplaza a los tres PATCH sueltos
(`/habilitar`, `/rendir`, `/anular`), que siguen existiendo.

`GET /vendedores/:id/cartones`:

```json
{ "vendedor": { "id": 32, "apellido": "Sosa", "nombre": "Nadia" },
  "totales": { "cartones": 111, "impagos": 30, "rendidos": 12, "pagados": 69,
               "habilitados": 69, "ganadores": 0, "recaudado": 345000 },
  "sorteos": [{ "sorteo_id": 20, "sorteo_numero": 2, "sorteo_nombre": "...",
                "sorteo_estado": "FINALIZADO", "cartones": 111,
                "impagos": 30, "rendidos": 12, "pagados": 69,
                "recaudado": 345000, "total_a_rendir": 555000 }] }
```

---

## Alta con PDF, QR y WhatsApp

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| POST | `/jugadores/nuevo` | ADMIN, VENDEDOR | Alta + cartón + PDF + enlace de WhatsApp |
| POST | `/jugadores/cartones/:id/pdf` | ADMIN, VENDEDOR | Reemite el PDF |
| GET | `/validar/:token` | **público** | Valida el cartón del QR |

```json
POST /jugadores/nuevo
{ "apellido": "Perez", "nombre": "Juan", "dni": "40222333",
  "whatsapp": "3764 123456",
  "ubicacion": { "latitud": -27.36, "longitud": -55.89 },
  "numeros": [3, 12, 25, 31, 44, 50, 61, 70, 77, 88] }
```

Respuesta a un **VENDEDOR**:

```json
{ "jugador": { },
  "credenciales": { "usuario": "40222333", "clave": "40222333" },
  "carton": { "codigo": "S0003-C002055", "estado_pago": "IMPAGO" },
  "pdf": { "archivo": "carton-S0003-C002055-179....pdf",
           "url": "/uploads/cartones/carton-S0003-C002055-179....pdf",
           "url_validacion": "http://localhost:5173/validar/8a5196af…" },
  "whatsapp": { "habilitado": true,
                "url": "https://api.whatsapp.com/send?phone=5493764123456&text=…",
                "destino": "5493764123456",
                "texto": "*BINGO DGG - TU CARTÓN* …",
                "mensaje_id": 1620 },
  "sorteo_iniciado": null, "advertencia": null }
```

A un **ADMIN** llega lo mismo salvo el WhatsApp:

```json
{ "whatsapp": { "habilitado": false,
                "motivo": "El envío por WhatsApp está disponible sólo para vendedores." } }
```

El jugador se da de alta **antes** de vender el cartón. Si la venta o el PDF
fallan, la respuesta sigue siendo 201 con el jugador creado y el detalle en
`advertencia`: así el vendedor no reintenta contra un DNI que ya existe.

`GET /validar/:token` (sin autenticación, 120 consultas por IP cada 15 min):

```json
{ "valido": true,
  "carton": { "codigo": "S0003-C002051", "estado": "ACTIVO",
              "estado_pago": "PAGADO", "habilitado": true,
              "cantidad_numeros": 10, "aciertos": 3 },
  "jugador": { "apellido": "Gordillo", "nombre": "German" },
  "vendedor": { "apellido": "Largo", "nombre": "Mauro", "telefono": "03815900938" },
  "sorteo": { "numero": 3, "nombre": "Goyito One", "estado": "EN_VENTA",
              "color": "#1baf7a", "rango_min": 1, "rango_max": 99 },
  "grilla": [{ "celda": 1, "numero": null, "salio": false }],
  "numeros_salidos": [ ] }
```

No devuelve el DNI ni el WhatsApp del jugador. Un token inexistente o con
formato inválido responde 404 en los dos casos.

### Enlace público del PDF

`GET /api/validar/:token/pdf` — sin autenticación, mismo token que el QR. Es el
enlace que viaja en el mensaje de WhatsApp, porque **`wa.me` no adjunta
archivos**. Si el archivo no está en disco se regenera al pedirlo.

Acceso por capacidad: el token es aleatorio de 128 bits. El PDF contiene el DNI
y el teléfono del jugador — los mismos datos que ya lleva el mensaje de WhatsApp
al que acompaña. La pantalla de validación (`/api/validar/:token`) sigue sin
exponerlos.

El alta devuelve las dos rutas:

```json
"pdf": { "archivo": "carton-S0003-C002055-179....pdf",
         "url": "/uploads/cartones/carton-S0003-C002055-179....pdf",
         "url_publica": "http://localhost:5173/api/validar/8a5196af…/pdf",
         "url_validacion": "http://localhost:5173/validar/8a5196af…" }
```

`url` es la ruta local que usa el panel del administrador (ya autenticado);
`url_publica` es la que se le manda al jugador.
