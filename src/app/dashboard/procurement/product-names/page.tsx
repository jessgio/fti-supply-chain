import { redirect } from "next/navigation";

/** Product names are edited on Master Data → SKUs & Franchises. */
export default function ProductNamesRedirectPage() {
  redirect("/dashboard/mappings");
}
