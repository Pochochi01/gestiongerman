# 07 · Seguridad

## Autenticación JWT

`POST /auth/login` verifica la clave con bcrypt y firma un token:

```js
{ usuarioId, rol, username, perfilId }   // perfilId = id de vendedor o jugador
```

Firmado con `JWT_SECRET`, vence según `JWT_EXPIRES_IN` (8 h por defecto). El
frontend lo guarda en `localStorage` y lo envía en cada request desde el
interceptor de axios.

`env.js` **se niega a arrancar en producción** si `JWT_SECRET` quedó en el valor
de desarrollo.

### Revalidación en cada request

`verificarToken` no se conforma con que la firma sea válida: vuelve a leer el
usuario de la base y rechaza si `activo = 0`.

```js
const usuario = await usuarioModel.buscarPorId(payload.usuarioId);
if (!usuario || !usuario.activo) throw ApiError.unauthorized('Usuario inactivo');
```

Así, inhabilitar un vendedor lo deja afuera **al instante**, sin esperar a que
venza su token.

## Autorización por rol

`permitir('ADMIN', 'VENDEDOR')` corta la request antes del controlador. Tres
roles: `ADMIN`, `VENDEDOR`, `JUGADOR`.

### El alcance también se controla dentro del controlador

El rol solo no alcanza: un vendedor tiene permiso de "listar jugadores", pero no
los de otro vendedor. Por eso el filtro sale del **token**, nunca del cliente:

```js
function vendedorDelRequest(req) {
  if (req.auth.rol === 'VENDEDOR') return req.auth.perfilId;   // del JWT
  return req.query.vendedor_id ? Number(req.query.vendedor_id) : null;  // sólo ADMIN
}
```

| Recurso | ADMIN | VENDEDOR | JUGADOR |
|---------|-------|----------|---------|
| Vendedores | CRUD completo | Ve su propia ficha | — |
| Jugadores | Todos | Sólo los suyos | Sólo el propio |
| Cartones | Todos | Los que vendió | Los suyos |
| Sorteos | Configura y carga números | Consulta | Consulta |
| WhatsApp | Panel completo | — | — |

`carton.controller.verificarAcceso()` aplica lo mismo al detalle de un cartón, y
`jugador.controller.verificarPropiedad()` al de un jugador.

## Claves

- Hash **bcrypt** con 10 rondas; nunca se almacena la clave en claro.
- La clave inicial de vendedores y jugadores es su DNI, con
  `debe_cambiar_password = 1`. El frontend ofrece cambiarla desde la barra
  superior.
- `PUT /auth/password` exige la clave actual y un mínimo de 6 caracteres.

> Para producción conviene **forzar** el cambio en el primer ingreso, bloqueando
> la navegación mientras `debe_cambiar_password` siga en 1. Hoy el flag se
> expone y se sugiere, pero no se impone.

## Superficie HTTP

| Control | Implementación |
|---------|----------------|
| Cabeceras de seguridad | `helmet` |
| CORS | Restringido a `CORS_ORIGIN` (lista separada por comas) |
| Fuerza bruta en login | `express-rate-limit`: 20 intentos por IP cada 15 min |
| Tamaño del body | `express.json({ limit: '1mb' })` |
| Validación de entrada | `express-validator` por ruta, más revalidación en los servicios |

## Inyección SQL

Todas las consultas usan sentencias preparadas de `mysql2` (`execute` con `?`).
No hay concatenación de valores en ningún modelo. Los fragmentos dinámicos se
limitan a nombres de columna fijos escritos en el código (`WHERE` armados a
partir de un arreglo cerrado de condiciones).

## Subida de archivos

`upload.middleware.js`:

- Sólo JPG, PNG, WEBP y PDF (`fileFilter` por mimetype).
- Máximo `UPLOAD_MAX_MB` (5 MB) y **un** archivo por request.
- Nombre generado con `crypto.randomBytes` — el nombre original nunca se usa en
  el filesystem, sólo se guarda en la base para mostrarlo.

## Pendientes para producción

1. **Servir por HTTPS.** El JWT viaja en una cabecera: sin TLS es interceptable.
2. **Mover el token a una cookie `httpOnly`.** `localStorage` es vulnerable a XSS.
3. **Refresh tokens.** Hoy, al vencer las 8 h hay que volver a ingresar.
4. **Rotar `JWT_SECRET`** y guardarlo en un gestor de secretos, no en `.env`.
5. **Registro de auditoría** de las acciones del administrador (habilitaciones,
   anulaciones, carga de números).
6. **Servir `/uploads` con control de acceso**: hoy es estático, y quien conozca
   el nombre aleatorio del archivo puede descargarlo sin autenticarse.
