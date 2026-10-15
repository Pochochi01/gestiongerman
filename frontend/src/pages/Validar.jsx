/**
 * /validar/:token — pantalla pública a la que lleva el QR del PDF.
 *
 * No requiere sesión: la escanea cualquiera con la cámara del teléfono. Por eso
 * el backend devuelve sólo lo necesario para verificar el cartón (sin DNI ni
 * teléfono del jugador).
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { validacionApi } from '../api/endpoints';
import { GrillaCarton } from '../components/Carton';
import { Alerta, Cargando, EstadoBadge } from '../components/ui';

export default function Validar() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    validacionApi
      .porToken(token)
      .then(setDatos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [token]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 p-4">
      <div className="w-full max-w-2xl space-y-4 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-marca-600 text-lg font-black text-white">
            B
          </span>
          <div>
            <p className="font-bold text-slate-900">DGG Gestión</p>
            <p className="text-xs text-slate-500">Validación de cartón</p>
          </div>
        </div>

        {cargando && <Cargando texto="Verificando el cartón..." />}

        {!cargando && error && (
          <div className="card space-y-2 ring-2 ring-rose-300">
            <p className="text-lg font-bold text-rose-700">Cartón no válido</p>
            <p className="text-sm text-slate-600">
              No encontramos ningún cartón con este código. Verificá que el QR esté completo o
              consultá con tu vendedor.
            </p>
            <Alerta tipo="error">{error}</Alerta>
          </div>
        )}

        {!cargando && datos && (
          <>
            <div className="card space-y-4 ring-2 ring-emerald-400">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                    ✓ Cartón auténtico
                  </p>
                  <p className="text-2xl font-bold text-slate-900">{datos.carton.codigo}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <EstadoBadge estado={datos.carton.estado_pago} />
                  {datos.carton.habilitado && (
                    <span className="badge bg-emerald-100 text-emerald-700">habilitado</span>
                  )}
                  {datos.carton.estado === 'GANADOR' && <EstadoBadge estado="GANADOR" />}
                </div>
              </div>

              <div
                className="rounded-lg p-3 text-sm"
                style={{ background: `${datos.sorteo.color}1a` }}
              >
                <p className="font-semibold text-slate-900">
                  Sorteo N° {datos.sorteo.numero} — {datos.sorteo.nombre}
                </p>
                <p className="text-slate-600">
                  Estado del sorteo: {datos.sorteo.estado} · números del {datos.sorteo.rango_min} al{' '}
                  {datos.sorteo.rango_max}
                </p>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Jugador</dt>
                  <dd className="font-medium text-slate-900">
                    {datos.jugador.apellido}, {datos.jugador.nombre}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Vendedor</dt>
                  <dd className="font-medium text-slate-900">
                    {datos.vendedor.apellido}, {datos.vendedor.nombre}
                  </dd>
                  <dd className="text-slate-600">{datos.vendedor.telefono}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Aciertos</dt>
                  <dd className="font-bold tabular-nums text-slate-900">
                    {datos.carton.aciertos} / {datos.carton.cantidad_numeros}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Emitido</dt>
                  <dd className="text-slate-700">
                    {new Date(datos.carton.emitido_en).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="card space-y-3">
              <h2 className="font-semibold text-slate-900">El cartón</h2>
              <GrillaCarton grilla={datos.grilla} />
              <p className="text-xs text-slate-500">
                En verde, los números que ya salieron ({datos.numeros_salidos.length} en total).
              </p>
            </div>

            {!datos.carton.habilitado && (
              <Alerta tipo="aviso">
                Este cartón todavía <strong>no está habilitado</strong>. Una vez que el vendedor
                rinda cuentas en un plazo de 24 hs se habilita. Si no recibís el mensaje de
                habilitado, contactá al vendedor.
              </Alerta>
            )}

            <p className="text-center text-xs text-slate-500">
              Para seguir el sorteo ingresá al sistema con tu DNI como usuario y clave.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
