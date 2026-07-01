import { DeliveryNoteWorkspace } from "@/components/delivery-note/delivery-note-workspace";

export const metadata = {
  title: "Delivery Note | From This Island",
  description: "External delivery note form for Cosmax inbound shipments.",
};

export default async function DeliveryNotePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <span className="text-sm font-semibold tracking-wide text-stone-800">
            FROM THIS ISLAND
          </span>
        </div>
      </header>
      <main className="px-4 py-8">
        <DeliveryNoteWorkspace token={token} />
      </main>
    </div>
  );
}
