import { StatusUpdatesShell } from "@/components/status-updates/status-updates-shell";

export default function StatusUpdatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StatusUpdatesShell>{children}</StatusUpdatesShell>;
}
