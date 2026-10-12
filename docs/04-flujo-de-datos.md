# 04 · Flujo de datos

Los ocho pasos del enunciado, con el archivo y las tablas que interviene cada uno.

---

## Paso 1 · El administrador define los cartones y habilita vendedores

```
Panel admin ──POST /api/sorteos──────────────> sorteo.service.crearSorteo()
                                                 └─> INSERT sorteos (estado CONFIGURACION)
            ──POST /api/sorteos/:id/abrir-venta─> estado EN_VENTA
            ──POST /api/vendedores─────────────> INSERT usuarios + domicilios
                                                        + ubicaciones + vendedores
```

El alta del vendedor es una única transacción: si falla cualquier inserción, no
queda ni el usuario huérfano ni la ubicación suelta.

---

## Paso 2 · El vendedor registra jugadores

```
POST /api/jugadores  (JWT del vendedor)
  └─ jugador.controller.crear
       ├─ valida que el vendedor esté habilitado
       ├─ normaliza el WhatsApp a 549XXXXXXXXXX
       ├─ verifica que el DNI no exista (jugadores ni usuarios)
       └─ transacción: usuarios → domicilios → ubicaciones → jugadores
```

El `vendedor_id` **no se lee del body**: sale de `req.auth.perfilId`, o sea del
token. Un vendedor no puede cargar un jugador a nombre de otro.

**Respuesta:** el jugador creado más `credenciales: { usuario: DNI, clave: DNI }`,
para que el vendedor se las dicte en el momento.

---

## Paso 3 · El jugador elige sus números

Dos caminos, misma lógica:

- **El vendedor los carga** en el alta (campo `numeros` del POST anterior).
- **El jugador los elige** desde `/jugador/elegir` → `POST /api/cartones`.

`SelectorNumeros` limita la selección a `numeros_por_carton` y ofrece elegir al
azar. El backend revalida con `helpers.validarNumeros()`: cantidad exacta, todos
enteros, dentro del rango y **sin repetidos**.

---

## Paso 4 · El sistema guarda el cartón con el ID del sorteo

`carton.service.venderCarton()`:

```js
await withTransaction(async (conn) => {
  const vendidos = await cartonModel.contarVendidos(sorteo.id, conn, true); // FOR UPDATE
  if (vendidos >= sorteo.cartones_objetivo) throw ApiError.conflict('...');

  const id = await cartonModel.crear({ ... }, numeros, conn);   // cartones + carton_numeros
  await cartonModel.actualizarCodigo(id, codigoCarton(sorteo.numero, id), conn);
  return { cartonId: id, completoElObjetivo: vendidos + 1 >= sorteo.cartones_objetivo };
});
```

El `FOR UPDATE` es lo que impide que dos ventas simultáneas superen el objetivo.
El código del cartón (`S0001-C000123`) se arma **después** del INSERT porque
necesita el id autoincremental.

Estado inicial: `estado = ACTIVO`, `estado_pago = IMPAGO`, `habilitado = 0`.

---

## Paso 5 · Se envía el cartón por WhatsApp

```
notificacion.notificarCartonNuevo({ sorteo, jugador, vendedor, carton, numeros })
  └─ plantillas.cartonNuevo(...)   → número de sorteo, datos del jugador,
  └─ whatsapp.enviar(...)            datos del vendedor, estado IMPAGO y el
       ├─ INSERT mensajes_whatsapp    aviso de las 24 hs
       ├─ sock.sendMessage(...)
       └─ UPDATE estado ENVIADO / ERROR
```

Se invoca **fuera de la transacción y con `.catch()`**: si WhatsApp está caído,
el cartón ya está vendido y el mensaje queda en la bandeja para reintentar.

---

## Paso 6 · Se completa la venta: arranca el sorteo y se avisa a todos

Si la venta del paso 4 devolvió `completoElObjetivo`, el mismo servicio llama a
`sorteo.service.iniciarSorteo()`:

1. `UPDATE sorteos SET estado_id = EN_CURSO, iniciado_en = NOW()`.
2. `notificacion.notificarInicioSorteo()` recorre
   `jugadorModel.conCartonEnSorteo()` y envía el aviso a cada jugador.

Desde ese momento `POST /api/cartones` responde 409: la venta está cerrada.

---

## Paso 7 · El administrador carga los números y el sistema valida

`POST /api/sorteos/:id/numeros` con `{ fecha, numero_sorteo, numeros }` →
`sorteo.service.cargarNumeros()`:

```
1. El sorteo debe estar EN_CURSO
2. Cada valor: de 1 a 4 cifras (si no, 400) → se toman las DOS ÚLTIMAS
      1234 → 34     0078 → 78     7 → 07
3. ── TRANSACCIÓN ──────────────────────────────────────────────
   a. Se separan los que suman de los que se ignoran, con su motivo:
        · repetido en esta misma carga
        · ya habia salido en este sorteo
        · fuera del rango del sorteo
   b. jornadas: se busca la fecha o se crea (UNIQUE sorteo_id + fecha),
      con nombre = 'Nocturna' y el numero_sorteo recibido
   c. INSERT numeros_extraidos: `numero` (2 cifras) + `valor_cargado` (4)
   d. progresoDelSorteo() → aciertos y completo por cartón
   e. UPDATE cartones.aciertos
   f. Los completos → estado GANADOR + INSERT ganadores
   g. Si hubo ganadores → sorteo FINALIZADO y jornada cerrada
   ── COMMIT ──────────────────────────────────────────────────
4. Fuera de la transacción: aviso de números del día y aviso a los ganadores
```

Todo el punto 3 es atómico. Los repetidos **no abortan la carga**: se registran
los números nuevos y la respuesta informa qué quedó afuera y por qué (en la
quiniela es normal que dos resultados terminen en las mismas dos cifras).

---

## Paso 8 · El jugador ve el progreso desde su cuenta

| Vista | Endpoint | Muestra |
|-------|----------|---------|
| `/jugador` | `GET /api/sorteos/vigente` | Cartones faltantes y números por jornada |
| `/jugador/cartones` | `GET /api/cartones` | Sus cartones y aciertos |
| `/jugador/cartones/:id` | `GET /api/cartones/:id` | Cartón pintado + datos del sorteo |

`GET /api/cartones` no recibe el id del jugador: el controlador lo deduce del
token (`filtrosPorRol`). Un jugador sólo ve lo suyo, un vendedor lo de sus
clientes y el administrador todo.

---

## Resumen: qué escribe cada paso

| Paso | Tablas afectadas |
|------|------------------|
| 1 | `sorteos`, `usuarios`, `domicilios`, `ubicaciones`, `vendedores` |
| 2 | `usuarios`, `domicilios`, `ubicaciones`, `jugadores` |
| 3–4 | `cartones`, `carton_numeros` |
| 5 | `mensajes_whatsapp` |
| 6 | `sorteos` (estado), `mensajes_whatsapp` |
| 7 | `jornadas`, `numeros_extraidos`, `cartones`, `ganadores`, `sorteos`, `mensajes_whatsapp` |
| 8 | — (sólo lectura) |
