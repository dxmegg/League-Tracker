import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface SortableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  defaultDir?: "asc" | "desc";
}

interface SortableTableProps<T extends object> {
  columns: Array<SortableColumn<T>>;
  rows: T[];
  defaultSortKey?: string;
  className?: string;
  rowKey?: (row: T) => string | number;
  renderExpandedRow?: (row: T) => ReactNode;
  onReachBottom?: () => void;
}

export function SortableTable<T extends object>({
  columns,
  rows,
  defaultSortKey,
  className = "",
  rowKey,
  renderExpandedRow,
  onReachBottom,
}: SortableTableProps<T>) {
  const firstKey = columns[0]?.key ?? "";
  const [sortKey, setSortKey] = useState<string>(defaultSortKey ?? firstKey);
  const [expandedKey, setExpandedKey] = useState<string | number | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">(() => {
    const col = columns.find((c) => c.key === (defaultSortKey ?? firstKey));
    return col?.defaultDir ?? "desc";
  });
  const canExpand = Boolean(renderExpandedRow && rowKey);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renderExpandedRow && !rowKey) {
      console.warn("SortableTable: renderExpandedRow requires rowKey; expansion is disabled.");
    }
  }, [renderExpandedRow, rowKey]);

  useEffect(() => {
    if (!onReachBottom) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onReachBottom();
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onReachBottom]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const valueOf = col.sortValue
      ? col.sortValue
      : (row: T) => {
          const value = Reflect.get(row, col.key);
          return typeof value === "number" || typeof value === "string" ? value : "";
        };
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
            sorted.map((row, i) => {
              const key = rowKey ? rowKey(row) : i;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={
                      canExpand
                        ? () => setExpandedKey((current) => (current === key ? null : key))
                        : undefined
                    }
                    className={
                      canExpand
                        ? "cursor-pointer transition-colors hover:bg-white/[0.03]"
                        : undefined
                    }
                  >
                    {columns.map((c) => (
                      <td key={c.key}>{c.render(row)}</td>
                    ))}
                  </tr>
                  {canExpand && expandedKey === key && (
                    <tr>
                      <td colSpan={columns.length} style={{ padding: 0, borderTop: 0 }}>
                        {renderExpandedRow!(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
          {onReachBottom && (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ padding: 0, borderTop: 0 }}>
                <div ref={sentinelRef} style={{ height: 1 }} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
