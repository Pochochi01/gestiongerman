/** Todos los cartones del jugador, dibujados como cartones de bingo. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cartonesApi, sorteosApi } from '../../api/endpoints';
import { GrillaCarton, construirGrilla } from '../../components/Carton';
import { Alerta, Cargando, EstadoBadge, Vacio } from '../../components/ui';

export default function Cartones() {
  const [lista, setLista] = useState([]);
  const [salidos, setSalidos] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    // Se pide también el sorteo vigente para poder pintar los números que
    // ya salieron en cada cartón del listado.
    Promise.all([cartonesApi.listar(), sorteosApi.vigente().catch(() => null)])
      .then(([cs, vigente]) => {
        setLista(cs);
        setSalidos(vigente?.numeros_salidos || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Cargando />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Mis cartones</h1>
      <Alerta tipo="error">{error}</Alerta>

      {lista.length === 0 ? (
        <Vacio>
          Todavía no tiene cartones.{' '}
          <Link to="/jugador/elegir" className="text-bingo-600 hover:underline">
            Elegir mis números
          </Link>
        </Vacio>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {lista.map((c) => {
            const grilla = construirGrilla(
              c.disposicion || (c.numeros || []).map((n) => ({ numero: n })),
              salidos
            );
            const aciertos = grilla.filter((x) => x.salio).length;

            return (
              <Link
                key={c.id}
                to={`/jugador/cartones/${c.id}`}
                className="card space-y-3 transition hover:ring-bingo-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{c.codigo}</p>
                    <p className="text-sm text-slate-500">
                      Sorteo N° {c.sorteo_numero} · {aciertos}/{c.cantidad_numeros} aciertos
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <EstadoBadge estado={c.estado_pago} />
                    {c.estado === 'GANADOR' && <EstadoBadge estado="GANADOR" />}
                  </div>
                </div>

                <GrillaCarton grilla={grilla} compacto />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
