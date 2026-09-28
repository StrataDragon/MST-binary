import React from "react";

export function SkeletonCard({ rows = 3, height = "h-24" }: { rows?: number; height?: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg shadow-sm p-4 space-y-3 animate-pulse ${height}`}>
      <div className="h-3 bg-gray-200 rounded w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-2.5 bg-gray-100 rounded w-full" />
      ))}
    </div>
  );
}

export function SkeletonTableRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="py-3 px-3"><div className="h-3 bg-gray-200 rounded w-16" /></td>
          <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-12" /></td>
          <td className="py-3 px-3"><div className="h-3 bg-gray-200 rounded w-24" /></td>
          <td className="py-3 px-3"><div className="h-3 bg-gray-200 rounded w-14" /></td>
          <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-16" /></td>
          <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-12" /></td>
          <td className="py-3 px-3"><div className="h-3 bg-gray-100 rounded w-16" /></td>
          <td className="py-3 px-3 text-right"><div className="h-3 bg-gray-100 rounded w-10 ml-auto" /></td>
        </tr>
      ))}
    </>
  );
}

export function EmptyStateBlock({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="p-8 text-center bg-page border border-border border-dashed rounded-lg space-y-2 font-mono">
      <div className="text-xs font-bold text-primary">{title}</div>
      <p className="text-xs text-secondary font-sans max-w-sm mx-auto">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-3 py-1.5 rounded bg-accent-blue hover:bg-blue-600 text-white font-bold text-xs shadow-xs"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
