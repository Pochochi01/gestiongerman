# 01 · Arquitectura

## Patrón MVC aplicado

El backend sigue MVC con una capa extra de **servicios**, para que las reglas de
negocio no queden repartidas entre controladores.

```
HTTP  →  routes  →  middlewares  →  controllers  →  services  →  models  →  MySQL
                     (JWT, rol,                     (reglas)     (SQL)
                      validación,
                      multer)
```

| Capa | Carpeta | Responsabilidad | Qué NO hace |
|------|---------|-----------------|-------------|
| **Modelo** | `src/models/` | Sentencias SQL, mapeo de filas | No decide reglas ni valida negocio |
| **Vista** | `frontend/src/` | Render y captura de datos | No conoce el esquema SQL |
| **Controlador** | `src/controllers/` | Leer `req`, delegar, responder | No arma SQL ni decide flujos largos |
| **Servicio** | `src/services/` | Reglas: cupos, validación de cartones, notificaciones | No toca `req`/`res` |
| **Rutas** | `src/routes/` | Endpoints, roles permitidos, validación de entrada | No contiene lógica |

### Por qué la capa de servicios

Dos operaciones concentran casi toda la complejidad del sistema:

1. **Vender un cartón** — verificar que haya cupo, reservarlo sin condiciones de
   carrera, guardar los números, enviar el WhatsApp y, si se completó el
   objetivo, iniciar el sorteo y avisar a todos.
2. **Cargar los números del día** — validar contra los ya extraídos en todo el
   sorteo, recalcular los aciertos de cada cartón, detectar los completos,
   registrar ganadores y finalizar.

Ambas abarcan varias tablas y deben ser atómicas. Viven en
[`carton.service.js`](../backend/src/services/carton.service.js) y
[`sorteo.service.js`](../backend/src/services/sorteo.service.js), y los
controladores sólo las invocan.

## Transacciones

`config/db.js` expone `withTransaction(fn)`: abre una conexión, hace `BEGIN`,
ejecuta `fn(conn)` y hace `COMMIT` o `ROLLBACK`. Todos los modelos aceptan un
`conn` opcional como último argumento, de modo que la misma función sirve dentro
y fuera de una transacción:

```js
const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);
```

### Control de concurrencia en la venta

Si dos vendedores cargan el último cartón al mismo tiempo, un `COUNT(*)` normal
dejaría vender los dos. Por eso el conteo se hace con bloqueo dentro de la
transacción:

```sql
SELECT COUNT(*) FROM cartones
 WHERE sorteo_id = ? AND estado_id <> (SELECT id FROM estados_carton WHERE codigo='ANULADO')
 FOR UPDATE
```

El segundo pedido espera al `COMMIT` del primero, ve el cupo agotado y recibe un
409.

## Manejo de errores

- `utils/ApiError.js` — error de negocio con código HTTP (`ApiError.conflict(...)`).
- `utils/helpers.js → asyncHandler` — envuelve los controladores async para que
  los rechazos lleguen a `next()`.
- `middlewares/error.middleware.js` — traduce `ApiError`, errores de multer y
  códigos de MySQL (`ER_DUP_ENTRY`, `ER_NO_REFERENCED_ROW_2`, …) a una
  respuesta uniforme.

Todas las respuestas tienen la misma forma:

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": "mensaje", "detalles": [ ] }
```

## Frontend

- **`api/client.js`** — instancia única de axios: inyecta el JWT, desenvuelve
  `{ ok, data }` y, ante un 401, limpia la sesión y redirige al login.
- **`context/AuthContext.jsx`** — token, rol y perfil (vendedor o jugador). Al
  montar revalida el token contra `GET /auth/perfil`.
- **`components/RutaProtegida.jsx`** — exige sesión y, opcionalmente, un rol.
- **`layouts/AppLayout.jsx`** — menú lateral que cambia según el rol.

Las páginas están agrupadas por rol (`pages/admin`, `pages/vendedor`,
`pages/jugador`), en correspondencia con los módulos del sistema.

## Los envíos de WhatsApp nunca bloquean

Un fallo de WhatsApp no debe abortar una venta. Por eso:

- `whatsapp.service.enviar()` **nunca lanza**: registra el mensaje en
  `mensajes_whatsapp` y marca `ENVIADO` o `ERROR`.
- Los servicios lo invocan con `.catch()` y fuera de la transacción.
- El administrador reintenta los fallidos desde el panel de WhatsApp, y al
  reconectarse la sesión se reprocesan solos.
