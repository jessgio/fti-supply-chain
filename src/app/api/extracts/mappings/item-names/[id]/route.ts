import { NextResponse } from "next/server";

const CATALOG_HINT =
  "Extract name ↔ item code is managed in the Extract Catalog. Manual item-name mapping writes are disabled.";

const gone = () =>
  NextResponse.json(
    {
      error: CATALOG_HINT,
      catalog: "/dashboard/extract-inbound-delivery-notes/codes",
    },
    { status: 410 },
  );

export async function PATCH() {
  return gone();
}

export async function DELETE() {
  return gone();
}
