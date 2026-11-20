import { MAP_ROWS, nextCols, type MapNode, type RunState } from '../../run';
import { NODE_GLYPH, NODE_LABEL } from '../nodes';

const ROW_H = 64;

function x(node: MapNode, rowSize: number) {
  return ((node.col + 1) / (rowSize + 1)) * 100;
}

/** The act map, boss at the top. Reachable nodes are buttons; the rest are drawn for context. */
export function RunMap({ run, onMove }: { run: RunState; onMove: (col: number) => void }) {
  const rows = run.map.rows;
  const height = rows.length * ROW_H;
  const y = (row: number) => height - (row + 0.5) * ROW_H;
  const reachable = new Set(nextCols(run));
  return (
    <div className="run-map" style={{ height }} aria-label="Map">
      <svg className="run-map__paths" width="100%" height={height} aria-hidden>
        {rows.slice(0, MAP_ROWS).flatMap((nodes, r) =>
          nodes.flatMap((n) =>
            n.next.map((c) => {
              const to = rows[r + 1]![c]!;
              const taken = r === run.row && n.col === run.col && reachable.has(c);
              return (
                <line
                  key={`${r}-${n.col}-${c}`}
                  x1={`${x(n, nodes.length)}%`}
                  y1={y(r)}
                  x2={`${x(to, rows[r + 1]!.length)}%`}
                  y2={y(r + 1)}
                  className={taken ? 'run-map__path--next' : ''}
                />
              );
            }),
          ),
        )}
      </svg>
      {rows.map((nodes, r) =>
        nodes.map((n) => {
          const here = r === run.row && n.col === run.col;
          const canGo = r === run.row + 1 && reachable.has(n.col);
          const past = r < run.row || here;
          return (
            <button
              key={`${r}-${n.col}`}
              type="button"
              className={`map-node map-node--${n.type}${canGo ? ' map-node--next' : ''}${here ? ' map-node--here' : ''}${past && !here ? ' map-node--past' : ''}`}
              style={{ left: `${x(n, nodes.length)}%`, top: y(r) }}
              disabled={!canGo}
              aria-label={`${NODE_LABEL[n.type]}, row ${r + 1}${here ? ', you are here' : ''}`}
              onClick={() => onMove(n.col)}
            >
              <span aria-hidden>{NODE_GLYPH[n.type]}</span>
            </button>
          );
        }),
      )}
    </div>
  );
}
