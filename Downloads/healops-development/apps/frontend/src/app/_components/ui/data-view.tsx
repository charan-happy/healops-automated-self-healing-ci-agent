"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { Card, CardContent, CardHeader } from "./card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

/* ============================= */
/* Types */
/* ============================= */

type ViewMode = "table" | "grid" | "compact";

interface Column<T> {
  key: keyof T & string;
  label: string;
  render?: (value: T[keyof T], item: T) => React.ReactNode;
}

interface DataViewProps<T extends { id: string | number }> {
  data: T[];
  columns: Column<T>[];
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  className?: string;
  gridCardRender?: (item: T) => React.ReactNode;
  compactRender?: (item: T) => React.ReactNode;
}

/* ============================= */
/* View Mode Toggle */
/* ============================= */

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
  {
    variants: {
      active: {
        true: "bg-brand-primary text-white shadow-sm",
        false: "text-muted-foreground hover:bg-muted hover:text-foreground",
      },
    },
  },
);

interface ViewToggleProps extends VariantProps<typeof toggleVariants> {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "grid", label: "Grid" },
  { value: "compact", label: "Compact" },
];

function ViewModeToggle({ viewMode, onViewModeChange, className }: ViewToggleProps) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1", className)}>
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onViewModeChange(option.value)}
          className={cn(toggleVariants({ active: viewMode === option.value }))}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ============================= */
/* Table View */
/* ============================= */

function DataTableView<T extends { id: string | number }>({
  data,
  columns,
}: Pick<DataViewProps<T>, "data" | "columns">) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key}>{col.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id}>
            {columns.map((col) => (
              <TableCell key={col.key}>
                {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "")}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ============================= */
/* Grid Card View */
/* ============================= */

function DataGridView<T extends { id: string | number }>({
  data,
  columns,
  gridCardRender,
}: Pick<DataViewProps<T>, "data" | "columns" | "gridCardRender">) {
  if (gridCardRender) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((item) => (
          <React.Fragment key={item.id}>{gridCardRender(item)}</React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((item) => (
        <Card key={item.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">#{String(item.id)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {columns.map((col) => (
              <div key={col.key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{col.label}</span>
                <span className="font-medium">
                  {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ============================= */
/* Compact List View */
/* ============================= */

function DataCompactView<T extends { id: string | number }>({
  data,
  columns,
  compactRender,
}: Pick<DataViewProps<T>, "data" | "columns" | "compactRender">) {
  if (compactRender) {
    return (
      <div className="divide-y divide-border rounded-lg border border-border">
        {data.map((item) => (
          <React.Fragment key={item.id}>{compactRender(item)}</React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {data.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-brand-sky/10"
        >
          <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
            #{String(item.id)}
          </span>
          {columns.map((col) => (
            <span key={col.key} className="min-w-0 flex-1 truncate text-sm">
              {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "")}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================= */
/* Main DataView Component */
/* ============================= */

function DataView<T extends { id: string | number }>({
  data,
  columns,
  viewMode: controlledMode,
  onViewModeChange,
  className,
  gridCardRender,
  compactRender,
}: DataViewProps<T>) {
  const [internalMode, setInternalMode] = React.useState<ViewMode>("table");
  const viewMode = controlledMode ?? internalMode;
  const setViewMode = onViewModeChange ?? setInternalMode;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-end">
        <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
      </div>

      {viewMode === "table" && <DataTableView data={data} columns={columns} />}
      {viewMode === "grid" && <DataGridView data={data} columns={columns} gridCardRender={gridCardRender} />}
      {viewMode === "compact" && <DataCompactView data={data} columns={columns} compactRender={compactRender} />}
    </div>
  );
}

/* ============================= */
/* Status badge helper */
/* ============================= */

const STATUS_VARIANT_MAP: Record<string, "success" | "warning" | "destructive" | "info" | "default" | "neutral"> = {
  completed: "success",
  "in progress": "info",
  planning: "warning",
  critical: "destructive",
};

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT_MAP[status.toLowerCase()] ?? "default";
  return <Badge variant={variant}>{status}</Badge>;
}

const PRIORITY_VARIANT_MAP: Record<string, "destructive" | "warning" | "default" | "neutral"> = {
  critical: "destructive",
  high: "warning",
  medium: "default",
  low: "neutral",
};

function PriorityBadge({ priority }: { priority: string }) {
  const variant = PRIORITY_VARIANT_MAP[priority.toLowerCase()] ?? "default";
  return <Badge variant={variant}>{priority}</Badge>;
}

export {
  DataView,
  DataTableView,
  DataGridView,
  DataCompactView,
  ViewModeToggle,
  StatusBadge,
  PriorityBadge,
  type ViewMode,
  type Column,
  type DataViewProps,
};
