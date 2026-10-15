# 06 · Integración WhatsApp (Baileys)

| Archivo | Rol |
|---------|-----|
| [`services/wa-auth.js`](../backend/src/services/wa-auth.js) | Persistencia de la sesión en `session.json` |
| [`services/whatsapp.service.js`](../backend/src/services/whatsapp.service.js) | Conexión, QR, reconexión, envío |
| [`services/plantillas.js`](../backend/src/services/plantillas.js) | Texto de los mensajes |
| [`services/notificacion.service.js`](../backend/src/services/notificacion.service.js) | Qué se notifica y a quién |
| [`controllers/whatsapp.controller.js`](../backend/src/controllers/whatsapp.controller.js) | Endpoints del panel |
| [`components/WhatsappSesion.jsx`](../frontend/src/components/WhatsappSesion.jsx) | Estado + QR + desvincular |

---

## Cómo funciona

Baileys implementa el protocolo **WhatsApp multi-dispositivo**: el servidor se
vincula al teléfono igual que WhatsApp Web, sin API oficial ni costo por mensaje.

```
                     ┌──────────────────────────────┐
  arranque ─────────>│  ¿existe backend/session.json│
                     │   con credenciales válidas?  │
                     └───────┬──────────────┬───────┘
                          sí │              │ no
                             ▼              ▼
                    reconecta solo     emite QR (consola +
                     (sin QR)           base64 al panel)
                             │              │
                             │         escaneo desde
                             │        el teléfono
                             ▼              ▼
                        ┌─────────────────────┐
                        │     CONECTADO       │──> envía y reenvía pendientes
                        └──────┬──────────────┘
                   caída de red│        │ logout (panel o teléfono)
                               ▼        ▼
                    backoff 5→60 s   borra session.json ──> vuelve al QR
```

### Estados que reporta el backend

| Estado | Significado en el panel |
|--------|-------------------------|
| `conectado` | Vinculado y enviando. Muestra el número y desde cuándo |
| `esperando_qr` | Hay un QR vigente para escanear |
| `conectando` | Handshake en curso |
| `desconectado` | Sin conexión; informa el próximo reintento |
| `deshabilitado` | `WA_ENABLED=false`: los mensajes se registran pero no se envían |

---

## Persistencia de la sesión

La sesión vive en **un solo archivo JSON**, configurable con `WA_SESSION_FILE`
(por defecto `backend/session.json`):

```json
{
  "creds": { "noiseKey": {...}, "signedIdentityKey": {...}, "me": {...}, "registered": true },
  "keys":  { "pre-key-1": {...}, "session-5493764123456.0": {...} }
}
```

- `creds` es la identidad del dispositivo vinculado. **Es lo que evita volver a
  escanear el QR.**
- `keys` son las claves de sesión de Signal y de sincronización de estado.

Baileys 6.x sólo trae `useMultiFileAuthState` (una carpeta con un archivo por
clave), así que el equivalente de archivo único está implementado en
`wa-auth.js`. Detalles que importan:

- Los valores son **Buffers**, que JSON no representa. Se serializan con
  `BufferJSON.replacer` / `reviver`, helpers de la propia Baileys.
- La escritura es **atómica**: se escribe `session.json.tmp` y se renombra, así
  un corte de luz no deja un JSON a medio escribir.
- Las escrituras se agrupan con un debounce de 150 ms, porque durante el
  arranque Baileys guarda claves muchas veces seguidas.
- Si el archivo queda ilegible, se **respalda** como
  `session.json.corrupto-<timestamp>` y se arranca de cero (habrá que escanear
  el QR), en lugar de dejar el sistema sin WhatsApp.

> `session.json` contiene credenciales que permiten enviar mensajes como ese
> número: está en `.gitignore` y **no debe versionarse ni compartirse**.
>
> Para comprobar la persistencia sin tocar WhatsApp: `npm run test:sesion`.

---

## Flujo 1 · Vinculación (primera vez)

1. El administrador entra a **`/admin/whatsapp`**.
2. El backend arranca la conexión al recibir `GET /api/whatsapp/estado`.
3. Como no hay `session.json`, Baileys emite un QR. El servicio lo convierte a
   **PNG en base64** (`data:image/png;base64,...`) y lo expone en el estado.
4. El panel lo muestra en un `<img>` junto con las instrucciones.
5. En el teléfono: **WhatsApp → Menú → Dispositivos vinculados → Vincular un
   dispositivo** → escanear.
6. Al vincularse, Baileys emite `creds.update`, el servicio hace `flush()` y
   `session.json` queda escrito.
7. WhatsApp pide reiniciar el socket (`restartRequired`, código 515): el
   servicio lo reabre solo, ahora ya autenticado.
8. El panel pasa a **conectado** y muestra el número vinculado.

El QR se renueva cada ~20 s. Por eso el panel consulta el estado **cada 3 s**
mientras está en `esperando_qr`, y cada 15 s en el resto de los casos. El QR que
devuelve el backend se considera vencido a los 60 s.

El QR sigue imprimiéndose también en la consola si `WA_PRINT_QR=true`.

## Flujo 2 · Reconexión

**Reinicio del backend.** Si `session.json` existe, se reconecta sin QR:

```
WhatsApp: sesión encontrada en C:\Proyectos\DGG Gestión\backend\session.json, reconectando sin QR
WhatsApp conectado (5493764123456). Sesión guardada en ...\session.json
```

**Caída de red.** El evento `connection.close` dispara un reintento con
**backoff exponencial**: 5 s, 10 s, 20 s, 40 s y de ahí en más cada 60 s. El
panel muestra el contador de intentos y cuándo será el próximo. El contador se
reinicia al reconectar.

**Casos especiales de `connection.close`:**

| Código | Situación | Qué hace el servicio |
|--------|-----------|----------------------|
| `restartRequired` (515) | Recién vinculado | Reabre el socket de inmediato, sin espera |
| `loggedOut` (401) | Sesión cerrada desde el teléfono | Borra `session.json` y emite un QR nuevo |
| otros | Red, timeout, error del servidor | Backoff exponencial |

Al reconectarse, `procesarPendientes()` reenvía automáticamente los mensajes que
habían quedado en `PENDIENTE` o `ERROR` con menos de 3 intentos.

## Flujo 3 · Desvinculación

Botón **Desvincular** del panel (pide confirmación) → `POST /api/whatsapp/desvincular`:

1. `sock.logout()` avisa a WhatsApp: el dispositivo **desaparece de la lista de
   Dispositivos vinculados del teléfono**. Queda liberado de los dos lados, no
   sólo en el servidor.
2. Se cierra el socket y se borra `session.json` (y su `.tmp`).
3. Se reinicia la conexión para que el panel muestre enseguida un QR nuevo.

Si el logout remoto falla (por ejemplo, ya no había conexión), el servidor
limpia igual sus credenciales y lo deja anotado en el log. En ese caso puede
quedar una entrada huérfana en el teléfono, que se borra a mano desde
Dispositivos vinculados.

---

## Endpoints (todos requieren rol ADMIN)

| Método | Ruta | Devuelve |
|--------|------|----------|
| GET | `/api/whatsapp/estado` | Estado completo + QR en base64 |
| GET | `/api/whatsapp/qr` | Sólo `{ qr, estado, mensaje }` |
| POST | `/api/whatsapp/vincular` | Fuerza la conexión para generar el QR |
| POST | `/api/whatsapp/desvincular` | Cierra sesión y borra `session.json` |
| POST | `/api/whatsapp/reintentar` | Reenvía pendientes y fallidos |
| GET | `/api/whatsapp/mensajes?limite=100` | Bandeja de salida |
| POST | `/api/whatsapp/cartones/:id/reenviar` | Reenvía a un jugador su cartón |

Ejemplo de `GET /api/whatsapp/estado`:

```json
{
  "ok": true,
  "data": {
    "habilitado": true,
    "estado": "conectado",
    "conectado": true,
    "telefono": "5493764123456",
    "conectado_desde": "2026-09-21T20:31:08.000Z",
    "qr": null,
    "sesion_guardada": true,
    "archivo_sesion": "C:\\Proyectos\\DGG Gestión\\backend\\session.json",
    "intentos_reconexion": 0,
    "reconectar_en": null,
    "ultimo_error": null,
    "mensaje": "Vinculado con el número 5493764123456. La sesión queda guardada: no hace falta volver a escanear el QR."
  }
}
```

Mientras espera el escaneo, `estado` es `"esperando_qr"` y `qr` trae el
`data:image/png;base64,...` que el panel pone directo en un `<img src>`.

---

## Envío de un mensaje con los datos del cartón

Es el mensaje del enunciado: número de sorteo, datos del jugador, datos del
vendedor con su celular, estado **IMPAGO** y el aviso de las 24 hs.

### Desde el código

```js
const notificacion = require('./services/notificacion.service');

await notificacion.notificarCartonNuevo({
  sorteo,                  // { numero, nombre, ... }
  jugador,                 // { id, apellido, nombre, dni, whatsapp }
  vendedor,                // { apellido, nombre, telefono }
  carton,                  // { id, codigo }
  numeros: [3, 12, 25, 31, 44, 50, 61, 70, 77, 88],
});
// -> { enviado: true|false, mensajeId: 42 }
```

`enviar()` **nunca lanza**: si WhatsApp está caído, deja el mensaje en
`mensajes_whatsapp` con estado `ERROR` y se reintenta solo al reconectar.

### Desde el panel o por API

```bash
curl -X POST http://localhost:4000/api/whatsapp/cartones/1/reenviar \
     -H "Authorization: Bearer $TOKEN"
```

```json
{ "ok": true,
  "data": { "enviado": true, "mensajeId": 42, "destino": "5493764123456",
            "carton": "S0001-C000001",
            "mensaje": "Cartón S0001-C000001 reenviado a 5493764123456" } }
```

En el panel es el selector **"Reenviar un cartón por WhatsApp"**: sirve para
probar la vinculación recién hecha y para reenviar un mensaje que falló.

### Mensaje que recibe el jugador

```
*DGG GESTIÓN - TU CARTON*

*Sorteo N°:* 1 - Bingo de octubre
*Carton N°:* S0001-C000001

*Jugador*
Sueldo, Susana
DNI: 29877781

*Tus numeros*
2 - 23 - 13 - 41 - 53 - 65 - 37 - 78 - 84 - 90

*Vendedor*
Largo, Mauro
Celular: 03815900938

*Estado del carton:* IMPAGO

Una vez que el vendedor rinda cuentas en un plazo de 24 hs se habilita el
carton. Si no recibe mensaje de habilitado, contacte al vendedor.

*Acceso al sistema*
Usuario: 29877781
Clave: tu DNI (cambiala al ingresar)
```

---

## Los cinco mensajes del sistema

| Evento | Tipo | Destinatario |
|--------|------|--------------|
| Se vende un cartón | `CARTON_NUEVO` | El jugador (estado IMPAGO + aviso de 24 hs) |
| El admin habilita el cartón | `CARTON_HABILITADO` | El jugador |
| Se completa la venta | `SORTEO_INICIADO` | Todos los jugadores del sorteo |
| Se cargan los números del día | `NUMEROS_DIA` | Todos los jugadores del sorteo |
| Un cartón se completa | `GANADOR` | El ganador |

El texto vive todo en `plantillas.js`. La constante `AVISO_RENDICION` guarda la
frase exacta que exige el enunciado.

## Normalización del número

Baileys exige el JID `549XXXXXXXXXX@s.whatsapp.net`.
`utils/helpers.normalizarWhatsapp()` convierte lo que escriba el vendedor:

| Entrada | Salida |
|---------|--------|
| `3764123456` | `5493764123456` |
| `03764-123456` | `5493764123456` |
| `+54 9 3764 123456` | `5493764123456` |
| `3764 15 123456` | `5493764123456` |

Quita el `0` de larga distancia y el `15` de celular, y antepone `549`. Si el
resultado no tiene entre 12 y 15 dígitos, el alta se rechaza con 400.

## Logs para el administrador

```
WhatsApp: no hay sesión guardada, se generará un código QR (se guardará en ...\session.json)
WhatsApp: código QR disponible en el panel del administrador (/admin/whatsapp)
WhatsApp: vinculación completada, reiniciando la conexión
WhatsApp conectado (5493764123456). Sesión guardada en ...\session.json
WhatsApp: se reenviaron 3 mensajes pendientes
WhatsApp: reintentando la conexión en 10 s (intento 2)
WhatsApp: la sesión se cerró desde el teléfono. Se borra session.json y se pedirá un QR nuevo
WhatsApp: desvinculado y ...\session.json eliminado
```

## Auditoría

`mensajes_whatsapp` registra tipo, estado, destino, contenido, error, intentos y
fechas, con FK a `jugadores` y `cartones`. El panel lo muestra en la bandeja de
salida con el detalle de cada error.

## Limitaciones a tener en cuenta

- Es un cliente no oficial: WhatsApp puede bloquear números que envíen volumen
  alto de mensajes no solicitados.
- Los avisos masivos se envían en serie dentro del request. Con cientos de
  jugadores conviene moverlos a una cola en segundo plano.
- El estado de la conexión vive en memoria del proceso: con varias instancias
  del backend, cada una tendría su propia sesión. Para escalar habría que
  dejar el envío en un único worker.
- El panel consulta el estado por *polling*. Para algo más vivo, el paso
  siguiente sería WebSocket o SSE.

---

## Problemas frecuentes

### "Error de conexión" al enviar, aunque el log diga que conectó

Síntoma en el log: se repite `[nodemon] restarting due to changes...` pocos
segundos después de `logging in...`, y la conexión nunca llega a `conectado`.

**Causa.** `session.json` vive en `backend/`, y nodemon por defecto vigila
*todos* los archivos de esa carpeta. Cada vez que Baileys guardaba credenciales
(`creds.update`), nodemon reiniciaba el servidor y mataba el handshake antes de
que se abriera la conexión. Como `estado` nunca llegaba a `conectado`, todo
envío fallaba con "WhatsApp no está conectado".

**Solución.** [`backend/nodemon.json`](../backend/nodemon.json) limita la
vigilancia a `src/` e ignora `session.json`, `uploads/` y `scripts/`. Los
cambios de configuración de nodemon **sólo se toman al arrancarlo de nuevo**: si
ya estaba corriendo, hay que cortarlo y volver a ejecutar `npm run dev`.

Además, `enviar()` ahora espera hasta 20 s a que termine el handshake en lugar
de fallar al instante, para que un envío disparado apenas arranca el servidor no
se pierda.

### `WhatsApp rechazó las credenciales (401)`

La sesión guardada ya no sirve. Pasa si el dispositivo se quitó desde el
teléfono, o si una vinculación quedó a medias (por ejemplo, por el problema de
nodemon de arriba: decenas de logins en pocos segundos hacen que WhatsApp
invalide el dispositivo).

El servicio borra `session.json` y genera un QR nuevo. Hay que volver a escanear
desde `/admin/whatsapp`.

### El QR se deja de mostrar y aparece `408 QR refs attempts ended`

WhatsApp rota el QR unas cinco veces y después cierra la conexión. Es normal si
nadie lo escanea: el servicio reintenta con backoff y emite un QR nuevo. También
se puede forzar con el botón **Vincular dispositivo**.

### Dos backends con el mismo `session.json`

No levantar dos instancias del backend apuntando al mismo archivo de sesión: las
dos intentan usar las mismas credenciales y WhatsApp termina invalidando el
dispositivo. Para un segundo entorno, usar otro `WA_SESSION_FILE`.
