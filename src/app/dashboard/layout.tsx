import { Sidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <SidebarProvider>
      <Sidebar
        role={profile?.role ?? null}
        displayName={profile?.fullName ?? null}
        email={profile?.email ?? null}
        userId={profile?.id ?? null}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </SidebarProvider>
  );
}
