import { cn } from "@/lib/utils";

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  /** Use the full main column; width tracks sidebar collapse via CSS variable. */
  wide?: boolean;
}

export function PageShell({ children, className, wide = false }: PageShellProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 space-y-6 p-6 lg:p-8",
        wide
          ? "max-w-[calc(100vw-var(--dashboard-sidebar-width,16rem)-3rem)]"
          : "mx-auto max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
