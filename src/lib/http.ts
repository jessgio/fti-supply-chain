export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(httpErrorMessage(res.status, text));
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? (data as { error?: unknown }).error
        : null;
    throw new Error(
      typeof err === "string" && err.trim()
        ? err
        : httpErrorMessage(res.status, text),
    );
  }
  return data as T;
}

function httpErrorMessage(status: number, text: string): string {
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
  if (
    status === 413 ||
    /request entity too large|payload too large|body exceeded/i.test(text)
  ) {
    return "The file is too large to send through the app server. Use a file of 15 MB or less.";
  }
  if (!snippet) return `Request failed (${status})`;
  return `Request failed (${status}): ${snippet}`;
}
