/**
 * Definicion de sorteos: cantidad de cartones a vender y numeros por carton
 * (hasta 10). Desde aqui se abre la venta y se fuerza el inicio si hace falta.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sorteosApi } from '../../api/endpoints';
import { Alerta, Campo, Cargando, EstadoBadge, Progreso, Vacio } from '../../components/ui';

/** Un sorteo es "activo" mientras no esté cerrado. */
const ACTIVOS = ['CONFIGURACION', 'EN_VENTA', 'EN_CURSO'];

/**
 * Slot de sorteo. Todo el bloque es un enlace al detalle
 * (`/admin/sorteos/:id`); los botones de acción quedan fuera del enlace para
 * que no disparen la navegación al hacer click.
 */
function SlotSorteo({ sorteo: s, accion }) {
  return (
    <div className="card space-y-3">
      <Link to={`/admin/sorteos/${s.id}`} className="block space-y-3 rounded-lg hover:bg-slate-50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-marca-700 hover:underline">
              Sorteo N° {s.numero} - {s.nombre}
            </p>
            <p className="text-sm text-slate-600">
              {s.numeros_por_carton} numeros por carton · rango {s.rango_min} a {s.rango_max} ·{' '}
              {s.cartones_vendidos} cartones
            </p>
          </div>
          <EstadoBadge estado={s.estado} />
        </div>
        <Progreso vendidos={s.cartones_vendidos} objetivo={s.cartones_objetivo} />
        <p className="text-xs text-slate-600">Ver detalle, cartones y resumen por vendedor →</p>
      </Link>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {s.estado === 'CONFIGURACION' && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => accion(() => sorteosApi.abrirVenta(s.id), 'Venta abierta.')}
          >
            Abrir venta
          </button>
        )}
        {s.estado === 'EN_VENTA' && (
          <button
            type="button"
            className="btn-success"
            onClick={() =>
              accion(
                () => sorteosApi.iniciar(s.id, s.cartones_faltantes > 0),
                'Sorteo iniciado: se avisa a los jugadores por WhatsApp.'
              )
            }
          >
            {s.cartones_faltantes > 0 ? 'Iniciar igual (forzar)' : 'Iniciar sorteo'}
          </button>
        )}
        {s.estado === 'EN_CURSO' && (
          <span className="text-sm text-slate-600">
            Cargue los numeros diarios desde la seccion "Cargar numeros".
          </span>
        )}
        <Link to={`/admin/sorteos/${s.id}`} className="btn-secondary ml-auto">
          Administrar cartones
        </Link>
      </div>
    </div>
  );
}

function GrupoSorteos({ titulo, vacio, sorteos, accion }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {titulo} ({sorteos.length})
      </h2>
      {sorteos.length === 0 ? (
        <Vacio>{vacio}</Vacio>
      ) : (
        sorteos.map((s) => <SlotSorteo key={s.id} sorteo={s} accion={accion} />)
      )}
    </section>
  );
}

const NUEVO = {
  nombre: '',
  cartones_objetivo: 100,
  numeros_por_carton: 10,
  rango_min: 1,
  rango_max: 90,
  precio_carton: 0,
};

export default function Sorteos() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(NUEVO);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setLista(await sorteosApi.listar());
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    try {
      const sorteo = await sorteosApi.crear({
        ...form,
        cartones_objetivo: Number(form.cartones_objetivo),
        numeros_por_carton: Number(form.numeros_por_carton),
        rango_min: Number(form.rango_min),
        rango_max: Number(form.rango_max),
        precio_carton: Number(form.precio_carton),
      });
      setMensaje({ tipo: 'exito', texto: `Sorteo N° ${sorteo.numero} creado en estado CONFIGURACION.` });
      setForm(NUEVO);
      cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  const accion = async (fn, textoOk) => {
    setMensaje(null);
    try {
      await fn();
      setMensaje({ tipo: 'exito', texto: textoOk });
      cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    }
  };

  const activos = lista.filter((s) => ACTIVOS.includes(s.estado));
  const historicos = lista.filter((s) => !ACTIVOS.includes(s.estado));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Sorteos</h1>
      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      <form onSubmit={crear} className="card space-y-4">
        <h2 className="font-semibold text-slate-900">Definir un nuevo sorteo</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            etiqueta="Nombre"
            contenedorClassName="sm:col-span-3"
            maxLength={80}
            placeholder="Sorteo solidario de octubre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            ayuda="Opcional. Si lo deja vacío se identifica solo por su número."
          />
          <Campo
            etiqueta="Cartones a vender"
            requerido
            type="number"
            inputMode="numeric"
            min={1}
            value={form.cartones_objetivo}
            onChange={(e) => setForm({ ...form, cartones_objetivo: e.target.value })}
            ayuda="Al venderse el último, el sorteo arranca solo."
          />
          <Campo
            etiqueta="Números por cartón"
            requerido
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={form.numeros_por_carton}
            onChange={(e) => setForm({ ...form, numeros_por_carton: e.target.value })}
            ayuda="De 1 a 10."
          />
          <Campo
            etiqueta="Precio del cartón"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.precio_carton}
            onChange={(e) => setForm({ ...form, precio_carton: e.target.value })}
          />
          <Campo
            etiqueta="Número mínimo"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.rango_min}
            onChange={(e) => setForm({ ...form, rango_min: e.target.value })}
          />
          <Campo
            etiqueta="Número máximo"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.rango_max}
            onChange={(e) => setForm({ ...form, rango_max: e.target.value })}
          />
        </div>
        <div className="btn-fila border-t border-slate-200 pt-4">
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Creando...' : 'Crear sorteo'}
          </button>
        </div>
      </form>

      {cargando ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <Vacio>Todavia no se definio ningun sorteo.</Vacio>
      ) : (
        <>
          <GrupoSorteos
            titulo="Activos"
            vacio="No hay sorteos activos en este momento."
            sorteos={activos}
            accion={accion}
          />
          <GrupoSorteos
            titulo="Historicos"
            vacio="Todavia no hay sorteos cerrados."
            sorteos={historicos}
            accion={accion}
          />
        </>
      )}
    </div>
  );
}
