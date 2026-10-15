/** Carton con los numeros que salieron pintados y los datos del sorteo. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cartonesApi } from '../../api/endpoints';
import Carton from '../../components/Carton';
import ListaSorteos from '../../components/ListaSorteos';
import { Alerta, Cargando, EstadoBadge, Vacio } from '../../components/ui';

export default function CartonDetalle() {
  const { id } = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cartonesApi
      .obtener(id)
      .then(setDatos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) return <Cargando />;
  if (error) return <Alerta tipo="error">{error}</Alerta>;
  if (!datos) return <Vacio>Carton no encontrado.</Vacio>;

  const { carton, sorteo, jornadas } = datos;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Carton {carton.codigo}</h1>
        <Link to="/jugador/cartones" className="text-sm text-marca-600 hover:underline">
          Volver
        </Link>
      </div>

      <Carton carton={carton} sorteo={sorteo} />

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">
            Sorteo N° {sorteo.numero} - {sorteo.nombre}
          </h2>
          <EstadoBadge estado={sorteo.estado} />
        </div>
        <p className="text-sm text-slate-600">
          {sorteo.estado === 'EN_VENTA'
            ? `Faltan ${sorteo.cartones_faltantes} cartones para iniciar el sorteo.`
            : `Cartones vendidos: ${sorteo.cartones_vendidos} de ${sorteo.cartones_objetivo}.`}
        </p>

      </div>

      {/* Control del sorteo: grilla de posiciones 1 a 20 por cada jornada */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Controlar los sorteos</h2>
        <ListaSorteos
          jornadas={jornadas}
          misNumeros={carton.numeros.map((n) => n.numero)}
          titulo="Sorteos cargados"
        />
      </div>
    </div>
  );
}
