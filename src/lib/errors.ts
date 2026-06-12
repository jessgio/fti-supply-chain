export function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  ) {
    const details =
      "details" in error && typeof (error as { details: unknown }).details === "string"
        ? (error as { details: string }).details
        : "";
    if (details.includes("po_number")) {
      return "That PO number is already in use.";
    }
    return "A record with that value already exists.";
  }
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Upload failed";
}
