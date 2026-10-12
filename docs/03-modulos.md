# 03 · Módulos

## Módulo 1 · Administrador

**Backend:** `controllers/vendedor.controller.js`, `controllers/sorteo.controller.js`
**Frontend:** `pages/admin/`

### CRUD de vendedores
`/admin/vendedores` y `/admin/vendedores/nuevo`

Campos: apellido, nombre, DNI, teléfono y domicilio (calle, número, piso,
depto). Sin mapas ni geolocalización — ver la nota al final de este documento.

El alta es una transacción que crea `usuarios` (username = DNI, clave inicial =
DNI, hash bcrypt), `domicilios` si se cargó una calle, y `vendedores`.

### Habilitar / inhabilitar
`PATCH /api/vendedores/:id/habilitacion` actualiza a la vez `vendedores.habilitado`
y `usuarios.activo`, así que un vendedor inhabilitado **no puede ni iniciar
sesión ni vender**. Se verifica en tres puntos: el login, el alta de jugadores y
la venta de cartones.

La baja definitiva se rechaza si el vendedor tiene jugadores cargados — el
sistema sugiere inhabilitarlo, para no perder la trazabilidad de sus ventas.

### Definir la cantidad de cartones
`/admin/sorteos`. Al crear un sorteo se define:

| Parámetro | Significado |
|-----------|-------------|
| `cartones_objetivo` | Cuántos cartones hay que vender para que arranque |
| `numeros_por_carton` | Hasta 10 (CHECK en la base y validación en el servicio) |
| `rango_min` / `rango_max` | Universo de números (por defecto 1–90) |
| `precio_carton` | Informativo |

El sorteo nace en `CONFIGURACION`; *Abrir venta* lo pasa a `EN_VENTA`. Sólo puede
haber **un** sorteo en venta a la vez.

La configuración se puede editar mientras no haya cartones vendidos; después, el
objetivo sólo puede subir y los números por cartón quedan congelados.

### Cargar los números del sorteo diario
`/admin/numeros`. Se elige la fecha y se escriben los números separados por
espacio o coma. El sistema los valida y recalcula todos los cartones —
detalle en [04-flujo-de-datos](04-flujo-de-datos.md#paso-7).

---

## Módulo 2 · Vendedores

**Backend:** `controllers/jugador.controller.js`
**Frontend:** `pages/vendedor/`

### Cargar jugadores
`/vendedor/jugadores/nuevo`. Datos: apellido, nombre, DNI y WhatsApp. Nada más:
no se piden domicilio, provincia, localidad ni geolocalización.

El **WhatsApp se normaliza** a formato internacional con
`utils/helpers.normalizarWhatsapp()`, que acepta `3764123456`, `03764-123456`,
`+54 9 3764 123456` o `3764 15 123456` y devuelve siempre `5493764123456`, que
es lo que necesita Baileys.

Si el sorteo está en venta, el mismo formulario permite elegir los números del
cartón. Al guardar se crean el jugador, su usuario y el cartón, y se dispara el
WhatsApp — todo en un paso.

### Ver sus clientes
`/vendedor/jugadores` lista **sólo los propios**: el filtro no viene del query
string sino de `req.auth.perfilId`, que sale del token JWT. Un vendedor no puede
listar los clientes de otro aunque manipule la URL.

`/vendedor/cartones` muestra los cartones vendidos, permite marcarlos como
rendidos y subir el comprobante (multer, imágenes o PDF de hasta 5 MB).

---

## Módulo 3 · Jugadores

**Backend:** `controllers/carton.controller.js`
**Frontend:** `pages/jugador/`

| Requisito | Dónde |
|-----------|-------|
| Elegir la cantidad de números (hasta 10) | `/jugador/elegir` — grilla con tope en `numeros_por_carton`, botón *Al azar* |
| Usuario y clave con el DNI | Se generan en el alta (`jugador.controller.crear`); la respuesta se las muestra al vendedor |
| Cartones faltantes para iniciar | `/jugador` — barra de progreso y `cartones_faltantes` |
| Números cargados por día | `/jugador` — listado por jornada |
| Cartón con los números pintados | `/jugador/cartones/:id` — verde = salió, gris = no |

`carton.service.vistaCarton()` arma esa vista: cruza los números del cartón con
los extraídos del sorteo y devuelve `[{ numero, salio }]` junto con los datos
del sorteo, del jugador y del vendedor.

---

## Módulo 4 · Sorteo

**Backend:** `services/sorteo.service.js`

### Estados

```
CONFIGURACION ──abrir venta──> EN_VENTA ──se vendió el último cartón──> EN_CURSO
                                                                           │
                                                          un cartón completo
                                                                           ↓
                                                                      FINALIZADO
```

El paso a `EN_CURSO` es **automático**: lo dispara `carton.service.venderCarton()`
cuando el contador llega al objetivo. El administrador puede forzarlo desde
`/admin/sorteos` si decide arrancar con menos cartones vendidos.

### Validación automática

En cada carga de números, y dentro de la misma transacción,
`cartonModel.progresoDelSorteo()` devuelve para cada cartón cuántos de sus
números salieron y si está completo:

```sql
SELECT c.id, c.cantidad_numeros,
       COUNT(ne.numero) AS aciertos,
       (COUNT(ne.numero) = c.cantidad_numeros) AS completo
  FROM cartones c
  JOIN carton_numeros cn ON cn.carton_id = c.id
  LEFT JOIN (SELECT DISTINCT ne.numero
               FROM numeros_extraidos ne
               JOIN jornadas jo ON jo.id = ne.jornada_id
              WHERE jo.sorteo_id = ?) ne ON ne.numero = cn.numero
 WHERE c.sorteo_id = ? AND c.estado_id <> (ANULADO)
 GROUP BY c.id, c.cantidad_numeros
```

Los completos pasan a `GANADOR`, se insertan en `ganadores` y el sorteo queda
`FINALIZADO`. Si hay varios en la misma jornada, **todos** son ganadores.

---

## Módulo 5 · WhatsApp

Detalle completo en [06-whatsapp](06-whatsapp.md). Resumen:

| Evento | Mensaje |
|--------|---------|
| Se vende un cartón | Cartón completo con estado **IMPAGO** y el aviso de las 24 hs |
| El admin habilita el cartón | Confirmación de habilitación |
| Se completa la venta | Aviso de inicio a todos los jugadores del sorteo |
| Se cargan los números del día | Números de la jornada |
| Un cartón se completa | Aviso al ganador |

El panel `/admin/whatsapp` muestra el estado de la sesión, avisa cuando hay un QR
pendiente y lista la bandeja de salida con los errores de envío.

### Panel de sesión (`/admin/whatsapp`)

El componente [`WhatsappSesion.jsx`](../frontend/src/components/WhatsappSesion.jsx)
muestra el estado de conexión con un semáforo, el número vinculado, el **QR en
pantalla** cuando hay que vincular y el botón de **Desvincular** (que cierra la
sesión en el teléfono y borra `session.json`). Consulta el estado cada 3 s
mientras hay un QR vigente y cada 15 s en el resto de los casos.

La misma página permite **reenviar un cartón** a un jugador, útil para probar la
vinculación recién hecha.

### El cartón como cartón de bingo

El jugador ve su cartón dibujado igual que uno de papel: **3 filas x 10
columnas**, 30 casilleros.

| Casillero | Aspecto |
|-----------|---------|
| Con número, todavía no salió | Fondo crema (`amber-50`) y texto oscuro |
| Con número, ya salió | Fondo verde claro (`emerald-200`), número en verde oscuro y borde grueso |
| Sin número | Gris medio (`slate-400`) |

El marco de la grilla es claro (`slate-100`): los casilleros vacíos quedan como
un bloque macizo gris y los que llevan número, como islas claras. Así se lee la
forma del cartón de un vistazo sin que los números pierdan contraste. Los vacíos
no llevan texto, así que el gris fuerte no afecta la legibilidad.

El mismo componente se usa en el listado `/jugador/cartones` y en el detalle, de
modo que un cartón se ve igual en todas las pantallas.

Reglas del reparto (`utils/helpers.generarDisposicion`):

- Los casilleros ocupados se sortean al azar; el resto queda vacío.
- Los números quedan en **orden ascendente** leyendo de izquierda a derecha y
  de arriba hacia abajo.
- El reparto entre filas es lo más parejo posible — con 10 números, 4/3/3, y la
  fila que lleva uno de más se elige al azar — para que se parezca a un cartón
  real y no queden todos los números apilados en una fila.

La disposición se calcula **una sola vez, al crear el cartón**, y se guarda en
`carton_numeros.celda`: el cartón siempre se ve igual.

El componente [`Carton.jsx`](../frontend/src/components/Carton.jsx) exporta
`GrillaCarton` (la grilla sola) y `construirGrilla`, que se reutilizan en el
listado `/jugador/cartones` para mostrar cada cartón en miniatura.

Verificación: `npm run test:carton` comprueba sobre 2000 cartones que no haya
casilleros repetidos, que el orden de lectura sea ascendente y que el reparto
entre filas nunca difiera en más de uno.

### Carga de números desde la quiniela

`/admin/numeros`. El administrador ingresa los números **tal como salen en la
quiniela, de hasta 4 cifras**, y el sistema valida los cartones con las **dos
últimas cifras**:

| Carga | Número que valida |
|-------|-------------------|
| `1234` | `34` |
| `0078` | `78` |
| `7` | `07` |
| `1200` | `00` |

El formulario muestra la traducción en vivo (`1234 → 34`) antes de guardar, así
el administrador ve exactamente qué va a entrar.

Cada carga queda registrada como una **jornada** con tres datos:

| Campo | Valor |
|-------|-------|
| `fecha` | La que elige el administrador (por defecto, hoy) |
| `nombre` | Fijo en **Nocturna** |
| `numero_sorteo` | El número de sorteo de esa quiniela (opcional) |

De cada número se guardan los dos valores: `valor_cargado` (las 4 cifras que se
tipearon) y `numero` (las dos últimas, que son las que juegan). El historial
muestra ambos, así queda la trazabilidad de la carga.

#### Qué pasa con los repetidos

En la quiniela es normal que dos resultados terminen en las mismas dos cifras,
o que un número ya haya salido otro día. **Eso no se trata como un error de
carga**: se registran los números nuevos y se informa qué quedó afuera y por
qué, en lugar de rechazar toda la jornada.

| Motivo | Cuándo |
|--------|--------|
| `repetido en esta misma carga` | Dos valores de la misma carga dan el mismo número |
| `ya habia salido en este sorteo` | El número salió en una jornada anterior |
| `fuera del rango del sorteo` | Las dos cifras caen fuera de `rango_min`–`rango_max` |

> Para un bingo basado en quiniela conviene que el sorteo tenga rango **0 a 99**,
> porque las dos últimas cifras cubren todo ese universo. Con un rango 1–90, los
> resultados terminados en `00` y en `91`–`99` se informan como ignorados.

La respuesta del endpoint y la pantalla muestran `cargados` e `ignorados` con el
detalle de cada uno. Verificación: `npm run test:quiniela`.

### Controlar el sorteo: grilla de posiciones 1 a 20

El jugador controla la quiniela contra su cartón desde una **lista desplegable
de sorteos** ([`ListaSorteos.jsx`](../frontend/src/components/ListaSorteos.jsx)),
presente en `/jugador` y en el detalle de cada cartón.

Cada sorteo es un acordeón. La cabecera resume fecha, lotería, número de sorteo,
cuántas posiciones se cargaron y **cuántos aciertos tiene el jugador en ese
sorteo**. Al desplegarlo aparece la grilla:

```
Pos.   Número
  1    12|34   en tu cartón
  2    56|11
  3    77|34   (ya había salido)
  …
 20    43|02
```

- Una columna con los puestos **1 a 20**, y al lado el número de esa posición.
- Se muestra el valor completo de la quiniela con las **dos últimas cifras
  destacadas**, que son las que juegan.
- Las posiciones cuyo número está en el cartón del jugador quedan remarcadas y
  rotuladas *en tu cartón*.
- Las posiciones todavía sin cargar se ven como *sin cargar*, así se nota
  cuánto falta del sorteo.
- El sorteo más reciente viene abierto; el resto, plegado.

#### Por qué se guardan las 20 posiciones

Para que la grilla sea un registro fiel del sorteo hay que guardar **todas** las
posiciones, incluso las que no suman al bingo porque esas dos cifras ya habían
salido. Si se guardaran sólo las que cuentan, la grilla tendría huecos y las
posiciones se correrían: el número de la posición 7 aparecería en la 5.

Por eso `numeros_extraidos.orden` es la **posición en el sorteo** y `cuenta`
distingue las que validan cartones (`1`) de las repetidas o fuera de rango
(`0`). Estas últimas se ven en la grilla con la aclaración *(ya había salido)*,
pero no pintan el cartón ni cuentan como acierto.

Migración para bases existentes: `npm run migrar:posiciones` (idempotente).
Verificación: `npm run test:posiciones`.

### Legibilidad de los números remarcados

En el cartón, los números que ya salieron van sobre **fondo verde claro con el
número en verde oscuro y borde grueso**, en lugar de texto blanco sobre verde
saturado. Se nota igual de rápido y el número se lee sin esfuerzo, que es lo que
importa cuando el jugador está cantando el cartón.

---

## Historial de sorteos y resultados

### Mis sorteos (`/jugador/sorteos`)

`GET /api/sorteos/historial?limite=10` devuelve los **últimos 10 sorteos en los
que participó** quien consulta. El filtro no viene del cliente: sale del token.

| Rol | Qué ve |
|-----|--------|
| JUGADOR | Los sorteos donde tiene cartones, más sus propios cartones |
| VENDEDOR | Los sorteos donde colocó cartones |
| ADMIN | Los últimos sorteos del sistema |

De cada sorteo trae todo lo necesario para controlarlo: datos del sorteo,
jornadas con la grilla de posiciones, números salidos, ganadores, el ranking de
20 y los cartones propios. La pantalla lo organiza en pestañas: **Resultado**,
**Top 20 cartones**, **Mis cartones** y **Sorteos diarios**.

### Ganadores

`GET /api/sorteos/:id/ganadores` y el bloque *Resultado* muestran, por cada
cartón ganador:

- el **cartón** (código y grilla dibujada, con los aciertos marcados),
- el **jugador** (apellido, nombre y DNI),
- el **vendedor** (apellido, nombre y teléfono),
- la **fecha** y la quiniela en que se completó.

Si hay más de un ganador se avisa que el premio se reparte.

### Top 20 cartones

`GET /api/sorteos/:id/ranking?limite=20` — los cartones que más números van
acertando, con puesto, aciertos, cuántos le faltan, jugador y vendedor. También
viene dentro de `resumen()`, así que aparece en el detalle del sorteo y en el
panel de carga de números.

Usa el campo cacheado `cartones.aciertos`, que se recalcula para todos los
cartones del sorteo en cada carga de números: el ranking queda al día sin
recorrer `carton_numeros` fila por fila.

---

## Avisos por WhatsApp de ganadores y habilitación

### Aviso a los ganadores

`POST /api/sorteos/:id/notificar-ganadores` (ADMIN) avisa a **todos** los
ganadores. El mensaje dice que el cartón ganó y **cuántos ganadores hubo en
total**, dato que sólo se conoce cuando están todos detectados:

```
*BINGO DGG - FELICITACIONES, GANASTE!*

SIMCabrera, Lucia: tu carton *S0002-C001512* completo todos sus numeros en el sorteo N° 2.
*Fecha del sorteo:* 2026-09-30

*Sos el UNICO ganador de este sorteo.*     <- o: *Ganadores en total:* 3 cartones (el tuyo y 2 mas)

*Tu vendedor:* SIMBenitez, Luis - 3764491442

En breve el vendedor se comunica con vos para la entrega del premio.
```

Al cerrarse el sorteo el envío sale **automáticamente**; el endpoint sirve para
reenviar si WhatsApp estaba caído. Responde 409 si el sorteo no tiene ganadores.

### Aviso de cartón habilitado

`POST /api/cartones/:id/notificar-habilitado` (ADMIN) reenvía el aviso con la
**URL del sistema y las credenciales**:

```
*BINGO DGG - CARTON HABILITADO*

Hola Rocio, tu carton *S0002-C001048* del sorteo N° 2 fue *HABILITADO*. ...

*Para seguir el sorteo ingresa aca:*
http://localhost:5173

*Usuario:* 90817267
*Clave:* 90817267  (es tu DNI, cambiala al ingresar)
```

La URL se configura con `APP_URL` en el `.env`.

> **Sobre la clave.** Sólo se conoce la inicial, que es el DNI, porque en la
> base hay un hash bcrypt. Si el jugador ya la cambió
> (`debe_cambiar_password = 0`), el mensaje **no inventa ninguna clave**: dice
> "la que ya definiste". Enviar una contraseña por WhatsApp es aceptable para
> una credencial inicial que además es pública (el DNI), pero no sustituye un
> flujo de recuperación: si el jugador la olvida, hoy hay que reiniciarla desde
> la base.

El endpoint exige que el cartón **ya esté habilitado**: si no, responde 409,
para no mandar un aviso falso.

---

## Gestión de sorteos desde el panel (`/admin/sorteos`)

### Listado

`/admin/sorteos` separa **activos** (`CONFIGURACION`, `EN_VENTA`, `EN_CURSO`) de
**históricos** (`FINALIZADO`, `CANCELADO`). Cada slot es un enlace al detalle;
los botones de acción quedan fuera del enlace para que no disparen navegación.

### Detalle (`/admin/sorteos/:id`)

[`SorteoDetalle.jsx`](../frontend/src/pages/admin/SorteoDetalle.jsx):

- **Datos del sorteo**: fechas de creación/inicio/fin, cartones vendidos sobre
  el objetivo, números por cartón, rango, precio, cantidad de vendedores,
  jornadas jugadas y ganadores.
- **Filtro por vendedor**: muestra los cartones que colocó. El selector lista
  los vendedores del sorteo con su cantidad de cartones.
- **Tabla de cartones**: si el sorteo está vigente (`EN_VENTA` o `EN_CURSO`),
  cada fila trae *Habilitar* / *Deshabilitar* y *Rendido*. Con el sorteo cerrado
  la tabla pasa a sólo lectura y se avisa por qué.
- **Pestañas**: Cartones · Vendedores · Top 20 · Ganadores.

### Resumen visual

[`ResumenEstados.jsx`](../frontend/src/components/ResumenEstados.jsx) muestra la
distribución de estados de pago en tres formas complementarias:

1. **Barra apilada horizontal** con la proporción de impagos / rendidos / pagados.
2. **Texto**: la cantidad y el porcentaje de cada estado, con una línea que
   explica qué significa.
3. **Barras por estado**, para comparar magnitudes (la apilada muestra
   proporción; estas, tamaño).

Decisiones de diseño del gráfico:

- **Barra apilada, no torta.** Para parte-de-todo con valores cercanos los
  sectores de una torta son imposibles de comparar. La barra apilada da la
  proporción y las barras individuales la magnitud.
- **Paleta de estado, no categórica**: impago → `#d03b3b`, rendido → `#fab219`,
  pagado → `#0ca30c`. Son colores reservados: no se reutilizan para series.
- El amarillo queda bajo 3:1 de contraste sobre blanco, así que **ningún color
  lleva significado solo**: cada uno va con su etiqueta y su número, y los
  mismos datos están en la tabla.

### Actualización

El detalle y la vista del vendedor se refrescan **cada 15 s**, y además
inmediatamente después de cada cambio, de modo que el resumen y el gráfico
acompañen la acción y que lo que marca el administrador se vea del lado del
vendedor sin recargar.

> Es **polling**, no push. Alcanza para el volumen de este sistema y no agrega
> infraestructura. Para algo instantáneo y con menos tráfico el paso siguiente
> sería SSE o WebSocket, publicando un evento al cambiar un cartón.

## Cartones del vendedor (`/vendedor/cartones`)

[`Cartones.jsx`](../frontend/src/pages/vendedor/Cartones.jsx) consume
`GET /api/vendedores/:id/cartones`:

Toda la estadística de la pantalla responde a **un selector de sorteo** que
está arriba, antes de los números:

| Selección | Qué muestran las tarjetas y el gráfico |
|-----------|----------------------------------------|
| Un sorteo | Los cartones de ese sorteo: vendidos, impagos, rendidos, pagados y recaudado |
| *Todos los sorteos* | La suma de todos (el acumulado histórico del vendedor) |

Al elegir un sorteo se agrega su estado, el mejor acierto y los ganadores, y
queda filtrado también el detalle de cartones. La fila correspondiente de la
tabla por sorteo queda marcada, y se puede elegir desde ahí haciendo click.

- **Tarjetas**: cartones vendidos, impagos, rendidos, pagados y recaudado sobre
  el total a rendir — del sorteo elegido.
- **Tabla por sorteo**: la vista general, con el desglose de cada uno.
- **Gráfico**: la distribución de estados del sorteo elegido.
- **Detalle de cartones**: filtrado por la misma selección, con la rendición y
  el comprobante.

Los números por sorteo vienen ya desglosados en
`GET /api/vendedores/:id/cartones`, así que cambiar de sorteo no dispara ningún
pedido nuevo: se recalcula en el cliente.

Un vendedor sólo puede consultar su propio resumen: pedir el de otro devuelve
403, y en `GET /sorteos/:id/cartones` el filtro se **fuerza** a su perfil
aunque mande otro `?vendedor=`.

---

## Alta de jugador con PDF y WhatsApp (`/vendedor/jugadores/nuevo`)

El botón **Guardar jugador** llama a `POST /api/jugadores/nuevo`
([`alta-jugador.service.js`](../backend/src/services/alta-jugador.service.js)),
que hace todo en una operación:

1. Registra el jugador y su usuario (username y clave = el DNI).
2. Vende el cartón con los números elegidos.
3. Genera el **PDF** con los datos y el **QR de validación**.
4. Devuelve el **enlace de WhatsApp** con el mensaje ya armado.

### El envío por WhatsApp

Lo manda el **vendedor desde su propio teléfono**, no el servidor. El backend
devuelve una URL `https://wa.me/<telefono>?text=<mensaje>` y el frontend la
abre: en el celular eso levanta la app de WhatsApp, en la computadora WhatsApp
Web.

El mensaje lleva los datos del jugador, del vendedor, los números del cartón y
el **enlace al PDF**. No menciona el estado del cartón.

> **`wa.me` no adjunta archivos**, sólo texto. Por eso el PDF viaja como enlace:
> WhatsApp le muestra la vista previa y el jugador lo abre o lo descarga con un
> toque. Adjuntar el archivo de verdad exigiría la API oficial de WhatsApp
> Business (de pago, con plantillas aprobadas) o volver al chatbot de Baileys.

El enlace del PDF es `/api/validar/<token>/pdf`: va por el token del cartón y no
por el nombre del archivo, así no cambia si el PDF se reemite, no expone el
directorio de uploads y, si el archivo falta, se regenera al pedirlo.

| | Antes (chatbot) | Ahora (enlace) |
|---|---|---|
| Quién envía | El número del sistema | El del vendedor |
| Vinculación | QR de Baileys, sesión viva | Nada |
| Riesgo de bloqueo | Alto con volumen | Ninguno |
| Confirmación de envío | Sí | **No**: depende de que el vendedor toque Enviar |

El mensaje queda registrado en `mensajes_whatsapp` como `PENDIENTE`, porque el
sistema lo generó pero no puede confirmar la entrega.

**Sólo para vendedores.** Para el ADMIN el backend responde
`whatsapp.habilitado = false` con el motivo, y la pantalla no abre nada: el
administrador carga desde el escritorio y no es quien tiene la relación con el
jugador — si el mensaje saliera del sistema, el jugador le contestaría a quien
no lo atiende. El administrador obtiene el PDF (botón **PDF** en
`/admin/cartones`).

> El apertura de WhatsApp se hace **en el mismo gesto del click**. Si se
> intentara después de un `await` largo o desde un efecto, el navegador lo
> trataría como popup y lo bloquearía.

### El PDF

[`pdf.service.js`](../backend/src/services/pdf.service.js), con `pdfkit` y
`qrcode`. Una hoja A4 con:

- encabezado en el **color del sorteo**, con el número de sorteo y el código de cartón;
- datos del jugador (apellido, nombre, DNI, WhatsApp) y del vendedor (apellido, nombre, celular, DNI);
- la fecha de emisión;
- el **cartón dibujado igual que en pantalla**: grilla 3 × 10, vacíos en gris
  `#94a3b8`, números sobre un tinte del color del sorteo;
- el **QR de validación**, con la leyenda: *"Este código QR es de uso exclusivo
  del vendedor para validar el cartón y evitar estafas."*

El PDF **no** imprime: el estado del cartón, la URL de validación (el QR ya la
lleva), las credenciales de acceso ni el aviso de las 24 hs.

El **estado del cartón queda fuera del PDF y del mensaje** a propósito: impago /
rendido / habilitado es información de cobranza entre el vendedor y la
administración, no algo que el jugador tenga que leer. Vive en el sistema, y el
vendedor lo consulta escaneando el QR — de ahí que la leyenda diga que el código
es de uso exclusivo suyo.

Queda en `backend/uploads/cartones/` y la referencia en `cartones.pdf_archivo`.
Se puede reemitir con `POST /api/jugadores/cartones/:id/pdf`.

### Color por sorteo

`sorteos.color_carton` guarda **un color por sorteo**, asignado al crearlo desde
una paleta categórica fija indexada por el número de sorteo
([`utils/colores.js`](../backend/src/utils/colores.js)).

Que el color viva en `sorteos` y no en `cartones` es deliberado: el color
depende del sorteo, no del cartón. Guardarlo en cada cartón sería una
dependencia transitiva (rompe 3FN) y permitiría que dos cartones del mismo
sorteo quedaran con colores distintos — justo lo que el requerimiento prohíbe.
Así, "todos los cartones del mismo sorteo con el mismo color" y "cambia al
cambiar de sorteo" se cumplen **por construcción**.

La paleta está validada: dentro de la banda de luminosidad, con separación para
daltonismo (peor par adyacente ΔE 9.1 en protanopía) y sin colores grisáceos.
Tres de los ocho slots quedan bajo 3:1 de contraste sobre blanco, así que el
color nunca lleva significado solo: el PDF imprime siempre el número y el
nombre del sorteo, el texto sobre el color se elige por luminancia, y los
números del cartón van sobre un tinte claro (contraste 14.7:1 a 16.8:1).

Con más de ocho sorteos la paleta se recicla: el color distingue sorteos
cercanos en el tiempo, no es un identificador.

### Validación por QR (`/validar/:token`)

El QR lleva a `APP_URL/validar/<token>`, una pantalla **pública**: la escanea
cualquiera con la cámara, sin cuenta. Muestra si el cartón es auténtico, su
estado, el jugador, el vendedor, el sorteo y el cartón con los aciertos
marcados.

`cartones.token_validacion` es aleatorio de 128 bits y único. Por ser una ruta
sin autenticación, la respuesta **no incluye el DNI ni el WhatsApp** del
jugador: sólo apellido y nombre, que es lo que necesita para reconocerse. Tiene
límite de 120 consultas cada 15 minutos por IP, y un token inexistente o mal
formado responde 404 (no distingue entre ambos casos).

## Estado del chatbot de Baileys

**Desconectado por defecto** (`WA_ENABLED=false`), pero entero y listo para
volver a usarse: el código, la sesión guardada en `session.json` y el panel
`/admin/whatsapp` siguen en su lugar. Para reactivarlo alcanza con poner
`WA_ENABLED=true` y reiniciar.

Mientras esté apagado, los avisos automáticos (cartón habilitado, números del
día, ganadores) **se registran en la bandeja pero no se envían**. Eso es parte
del cambio: el canal pasó a ser el WhatsApp del vendedor. Si se quiere que esos
avisos vuelvan a salir solos, hay que reactivar el chatbot.

---

## Sin geolocalización

El sistema **no usa mapas**. Se quitaron de las pantallas, se borraron los
componentes y **Leaflet quedó desinstalado** (`leaflet` y `react-leaflet`).

Qué se saco de cada pantalla:

| Pantalla | Antes | Ahora |
|----------|-------|-------|
| `/vendedor/jugadores/nuevo` | domicilio con provincia y localidad + mapa | sólo apellido, nombre, DNI, WhatsApp y números |
| `/admin/vendedores/nuevo` | domicilio completo + mapa | domicilio de calle y número |
| `/admin` (panel) | mapa de vendedores | — |
| `/vendedor` (panel) | mapa de clientes | — |
| listados | columna *Localidad* | — |

En el backend desaparecieron `GET /api/vendedores/mapa`,
`GET /api/jugadores/mapa` y los dos endpoints de `/api/catalogos`. El modelo
`geo.model.js` se reemplazó por
[`domicilio.model.js`](../backend/src/models/domicilio.model.js), que sólo
maneja el domicilio del vendedor.

En la base, la migración 005 eliminó la tabla `ubicaciones` y las columnas que
la referenciaban — ver [02-base-de-datos](02-base-de-datos.md#sin-geolocalización-migración-005).

Efecto colateral medible: el bundle del frontend bajó de **485 KB a 319 KB**
(y el CSS de 44 KB a 29 KB), porque Leaflet y sus estilos se fueron con él.
