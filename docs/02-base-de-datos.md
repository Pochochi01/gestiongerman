# 02 · Base de datos

Esquema completo: [`backend/database/schema.sql`](../backend/database/schema.sql)
Datos iniciales: [`backend/database/seed.sql`](../backend/database/seed.sql)

## Diagrama de relaciones

```
domicilios ──< vendedores >── usuarios >── roles
                   │
                   └──< jugadores >── usuarios
                                                              │
sorteos ──< cartones >────────────────────────────────────────┘
   │           │
   │           ├──< carton_numeros
   │           ├──< comprobantes
   │           └──< ganadores
   │
   └──< jornadas ──< numeros_extraidos

mensajes_whatsapp >── tipos_mensaje, estados_envio, jugadores, cartones
```

## Tablas

### Catálogos
`roles`, `estados_sorteo`, `estados_pago`, `estados_carton`, `tipos_mensaje`,
`estados_envio`. Cada uno con `codigo` (UNIQUE, usado por el código) y `nombre`
(el texto que ve el usuario).

### Domicilios
| Tabla | Descripción |
|-------|-------------|
| `domicilios` | Calle, número, piso, depto del vendedor |
| `provincias` / `localidades` | **Sin uso.** Quedaron del domicilio completo; se conservan como catálogo |

### Personas
| Tabla | Campos propios |
|-------|----------------|
| `usuarios` | `username` (DNI), `password_hash` (bcrypt), `rol_id`, `activo`, `es_raiz` |
| `administradores` | apellido, nombre, DNI, `creado_por`. **No contiene la cuenta raíz** |
| `vendedores` | apellido, nombre, DNI, teléfono, `domicilio_id`, `habilitado` |
| `jugadores` | apellido, nombre, DNI, `whatsapp`, `vendedor_id` |

### Sorteo
| Tabla | Campos clave |
|-------|--------------|
| `sorteos` | `numero`, `cartones_objetivo`, `numeros_por_carton` (CHECK 1–10), `rango_min`/`rango_max`, `estado_id` |
| `cartones` | `codigo` (`S0001-C000123`), `sorteo_id`, `jugador_id`, `vendedor_id`, `estado_pago_id`, `habilitado`, `aciertos` |
| `carton_numeros` | PK `(carton_id, numero)`, más `posicion` única por cartón |
| `jornadas` | `(sorteo_id, fecha)` UNIQUE — una por día de sorteo |
| `numeros_extraidos` | `(jornada_id, numero)` UNIQUE, con `orden` |
| `ganadores` | Cartón ganador, jornada en que se completó, posición |
| `comprobantes` | Archivo de rendición subido con multer |
| `mensajes_whatsapp` | Auditoría de cada mensaje generado |

## Justificación de la normalización

### 1FN — ningún grupo repetitivo

El error típico sería guardar `numero_1 … numero_10` en `cartones`. En su lugar,
los números viven en **`carton_numeros`** con clave primaria compuesta
`(carton_id, numero)`. Ventajas:

- Un cartón admite 3, 7 o 10 números sin cambiar el esquema.
- La PK impide números repetidos dentro del mismo cartón.
- Contar aciertos es un `JOIN` + `COUNT`, no diez comparaciones.

Lo mismo con los números extraídos, que cuelgan de `numeros_extraidos`.

### 2FN — sin dependencias parciales de la clave

En `carton_numeros`, la clave es `(carton_id, numero)` y el único atributo extra
es `posicion`, que depende de la clave **completa** (la posición de *ese* número
en *ese* cartón). No hay atributos del cartón ni del sorteo repetidos ahí.

### 3FN — sin dependencias transitivas

| Riesgo | Solución |
|--------|----------|
| Guardar `provincia` y `codigo_postal` en cada domicilio (dependen de la localidad, no del domicilio) | `domicilios → localidades → provincias`; el CP vive en `localidades`. *(Hoy sin uso: ver más abajo.)* |
| Guardar el texto `"Impago"` en cada cartón | `cartones.estado_pago_id → estados_pago` |
| Guardar el nombre y teléfono del vendedor en cada cartón (dependen del vendedor, no del cartón) | `cartones.vendedor_id → vendedores`; el JOIN los trae |
| Guardar el nombre del sorteo en cada cartón | `cartones.sorteo_id → sorteos` |

### Desnormalización deliberada

`cartones.aciertos` es un valor **calculable** a partir de `carton_numeros` y
`numeros_extraidos` — estrictamente, redundante. Se mantiene como caché porque
los listados lo muestran en cada fila y recalcularlo por cartón sería costoso.
Lo recalcula **una sola función**
([`sorteo.service.cargarNumeros`](../backend/src/services/sorteo.service.js)) en
cada carga de números, dentro de la transacción, así que no puede quedar
desfasado. Toda decisión (ganador, finalización) se toma con la consulta real,
nunca con este campo.

## Reglas que quedan en la aplicación

Dos reglas no se pueden expresar con restricciones declarativas de MySQL:

1. **Un número no puede repetirse en todo el sorteo**, sólo en la jornada.
   La UNIQUE de `numeros_extraidos` cubre `(jornada_id, numero)`; abarcar el
   sorteo exigiría duplicar `sorteo_id` en la tabla (rompiendo la 3FN) o un
   trigger. Se valida en `sorteo.service.cargarNumeros`, dentro de la
   transacción, comparando contra `jornadaModel.numerosDelSorteo()`.
2. **No vender más cartones que `cartones_objetivo`.** Se resuelve con
   `SELECT … FOR UPDATE` en la transacción de venta (ver
   [01-arquitectura](01-arquitectura.md#control-de-concurrencia-en-la-venta)).

## Vistas de apoyo

| Vista | Uso |
|-------|-----|
| `v_sorteo_progreso` | Vendidos y faltantes por sorteo, excluyendo anulados |
| `v_numeros_sorteo` | Todos los números extraídos de un sorteo con su fecha |

## Disposición gráfica del cartón

`carton_numeros.celda` guarda el casillero (1..30) que ocupa cada número en la
grilla de 3 filas x 10 columnas con que se dibuja el cartón.

Se **persiste** en lugar de calcularse al mostrar el cartón: la ubicación se
sortea una sola vez, al crearlo. Si se recalculara en cada consulta, el cartón
del jugador cambiaría de forma cada vez que abre la pantalla, y dejaría de ser
el mismo cartón que se le envió por WhatsApp.

En términos de normalización, `celda` depende de la clave completa
`(carton_id, numero)` — igual que `posicion` — así que no afecta la 2FN ni la
3FN. La restricción `UNIQUE (carton_id, celda)` impide que dos números caigan
en el mismo casillero.

> `posicion` (orden de lectura 1..N) queda determinado por `celda`, así que es
> redundante. Se conserva porque el resto del sistema ordena por ese campo y
> ambos se escriben juntos, en la misma operación.

Para bases ya creadas: `npm run migrar:celdas` agrega la columna, reparte los
cartones existentes y crea el índice único. Es idempotente.

## Carga de números por quiniela

Los números se cargan como salen en la quiniela (hasta 4 cifras) y los cartones
se validan con las dos últimas. Eso se refleja en dos tablas:

| Tabla | Columna | Contenido |
|-------|---------|-----------|
| `usuarios` | `es_raiz` | `1` en el administrador fundador. Es la única cuenta que los administradores creados desde el sistema no pueden ver ni tocar: no tiene fila en `administradores`, que es la tabla contra la que resuelve el `:id` de ese CRUD |
| `jornadas` | `nombre` | Lotería de origen. Fijo en `'Nocturna'` |
| `jornadas` | `numero_sorteo` | Número de sorteo de esa quiniela (NULL si no se informó) |
| `numeros_extraidos` | `valor_cargado` | Lo que tipeó el administrador (ej. `1234`) |
| `numeros_extraidos` | `numero` | Las dos últimas cifras, que validan (ej. `34`) |

`numero` sigue siendo la columna con la que juega todo el sistema, así que las
consultas de validación de cartones no cambiaron. `valor_cargado` es sólo
trazabilidad: permite auditar de qué resultado salió cada número.

`UNIQUE (jornada_id, numero)` sigue impidiendo el mismo número dos veces en una
jornada; que no se repita en todo el sorteo se valida en el servicio, igual que
antes.

Para bases ya creadas: `npm run migrar:nocturna` (idempotente).

> Para un bingo basado en quiniela conviene crear el sorteo con rango **0 a 99**:
> las dos últimas cifras cubren exactamente ese universo.

## Posiciones del sorteo (grilla 1 a 20)

`numeros_extraidos` guarda **una fila por posición del sorteo**, no sólo por
número que valida:

| Columna | Significado |
|---------|-------------|
| `orden` | Posición en el sorteo (1..20). `UNIQUE (jornada_id, orden)` |
| `valor_cargado` | El valor de la quiniela en esa posición (ej. `7734`) |
| `numero` | Sus dos últimas cifras (ej. `34`) |
| `cuenta` | `1` si valida cartones; `0` si repetido o fuera de rango |

Se **quitó** `UNIQUE (jornada_id, numero)`: en la quiniela es normal que dos
posiciones terminen en las mismas dos cifras, y ambas tienen que quedar
registradas para que la grilla del jugador no tenga huecos.

La unicidad que importa la da `UNIQUE (jornada_id, orden)`: una sola entrada por
posición. Que un número no se cuente dos veces lo resuelve `cuenta`, que fija el
servicio al cargar: la primera aparición cuenta, las siguientes no.

Las consultas de validación filtran `cuenta = 1`:

- `jornada.model.numerosDelSorteo()` — qué números ya salieron
- `carton.model.progresoDelSorteo()` — aciertos y cartones completos

Migración: `npm run migrar:posiciones` (idempotente).

## Sin geolocalización (migración 005)

El sistema dejó de usar mapas, así que Leaflet se desinstaló y las coordenadas
se eliminaron:

| Se eliminó | Qué era |
|------------|---------|
| tabla `ubicaciones` | el punto lat/lng |
| `vendedores.ubicacion_id` | su coordenada |
| `jugadores.ubicacion_id` | su coordenada |
| `jugadores.domicilio_id` | el alta de jugador ya no pide domicilio |

Lo que queda:

- `domicilios` sigue, con **`localidad_id` ahora NULL**: el vendedor conserva un
  domicilio de calle y número, sin provincia ni localidad.
- `localidades` y `provincias` quedan **sin uso**. No se borraron para no perder
  el catálogo si más adelante vuelve el domicilio completo; tampoco hay
  endpoints que las consulten.

Migración: `npm run migrar:sin-geo` (idempotente). **Es irreversible**: se
pierden las coordenadas cargadas.
