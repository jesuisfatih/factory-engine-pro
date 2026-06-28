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
          <div className="seg">{row.original.segment} - U{row.original.urgencyScore}</div>
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
    state: { rowPinning: { top: pinned.map((card) => card.id) } },
    keepPinnedRows: true,
    getRowId: (row) => row.id,
  });

  return (
    <aside className="pin-panel">
      <h2>
        Pinned board <span className="badge">{pinned.length}</span>
      </h2>
      {pinned.length === 0 ? (
        <div className="empty">Pin a live queue card to keep it visible here.</div>
      ) : (
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
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
