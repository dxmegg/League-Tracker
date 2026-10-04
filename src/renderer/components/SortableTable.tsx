import { useMemo, useState, type ReactNode } from "react";

export interface SortableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  defaultDir?: "asc" | "desc";
}

export function SortableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  defaultSortKey,
  className = "",
}: {
  columns: Array<SortableColumn<T>>;
  rows: T[];
  defaultSortKey?: string;
  className?: string;
}) {
  const firstKey = columns[0]?.key ?? "";
  const [sortKey, setSortKey] = useState<string>(defaultSortKey ?? firstKey);
  const [dir, setDir] = useState<"asc" | "desc">(() => {
    const col = columns.find((c) => c.key === (defaultSortKey ?? firstKey));
    return col?.defaultDir ?? "desc";
  });

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const valueOf = col.sortValue
      ? col.sortValue
      : (row: T) => (row[col.key] as number | string | undefined) ?? "";
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va === vb) return 0;
      const cmp = va > vb ? 1 : -1;
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns, sortKey, dir]);

  const handleHeaderClick = (key: string) => {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const col = columns.find((c) => c.key === key);
      setDir(col?.defaultDir ?? "desc");
    }
  };

  return (
    <div className={`scroll ${className}`}>
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => handleHeaderClick(c.key)}
                aria-sort={
                  c.key === sortKey ? (dir === "asc" ? "ascending" : "descending") : undefined
                }
              >
                {c.label}
                {c.key === sortKey ? (dir === "asc" ? " ▴" : " ▾") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: "left" }}>
                No results
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
