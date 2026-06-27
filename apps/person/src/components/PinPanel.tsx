import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import type { Card } from '../types';

interface Props {
  pinned: Card[];
  onUnpin: (id: string) => void;
}

export function PinPanel({ pinned, onUnpin }: Props) {
  const columns: ColumnDef<Card>[] = [
    {
      id: 'name',
      header: 'Pinned card',
      cell: ({ row }) => (
        <>
          <div className="name">{row.original.title}</div>
          <div className="seg">{row.original.segment} · P{row.original.priority}</div>
        </>
      ),
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onUnpin(row.original.id)}
          className="pin-btn pinned"
          style={{ float: 'right' }}
        >
          Unpin
        </button>
      ),
    },
  ];

  const table = useReactTable({
    data: pinned,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      rowPinning: { top: pinned.map((c) => c.id) },
    },
    keepPinnedRows: true,
    getRowId: (row) => row.id,
  });

  return (
    <aside className="pin-panel">
      <h2>
        Pinned board <span className="badge">{pinned.length}</span>
      </h2>
      {pinned.length === 0 ? (
        <div className="empty">Hiç pin yok. Karttaki ☆ Pin'e bas, en üste sabitlensin.</div>
      ) : (
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </aside>
  );
}
