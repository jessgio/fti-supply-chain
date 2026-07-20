type LarkApiResponse<T> = {
  code: number;
  msg: string;
  data?: T;
  error?: unknown;
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

function larkBaseUrl(): string {
  return (
    process.env.LARK_BASE_URL?.replace(/\/$/, "") ||
    "https://open.larksuite.com"
  );
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getLarkApprovalCode(): string {
  return requireEnv("LARK_APPROVAL_CODE");
}

function formatFetchFailure(err: unknown, label: string): Error {
  if (err instanceof Error) {
    const cause =
      "cause" in err && err.cause instanceof Error
        ? err.cause.message
        : "cause" in err && err.cause
          ? String(err.cause)
          : "";
    const detail = [err.message, cause].filter(Boolean).join(" — ");
    return new Error(`${label}: ${detail}`);
  }
  return new Error(`${label}: ${String(err)}`);
}

async function larkFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has("Content-Type") && rest.body) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${larkBaseUrl()}${path}`, {
      ...rest,
      headers,
    });
  } catch (err) {
    throw formatFetchFailure(err, `Lark API unreachable (${path})`);
  }

  let json: LarkApiResponse<T>;
  try {
    json = (await res.json()) as LarkApiResponse<T>;
  } catch {
    throw new Error(`Lark API returned non-JSON (HTTP ${res.status})`);
  }

  if (json.code !== 0) {
    const detail =
      typeof json.msg === "string" && json.msg
        ? json.msg
        : `HTTP ${res.status}`;
    throw new Error(`Lark API error ${json.code}: ${detail}`);
  }

  return json.data as T;
}

export async function getTenantAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const appId = requireEnv("LARK_APP_ID");
  const appSecret = requireEnv("LARK_APP_SECRET");

  let res: Response;
  try {
    res = await fetch(
      `${larkBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
    );
  } catch (err) {
    throw formatFetchFailure(err, "Lark token API unreachable");
  }

  let json: {
    code: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new Error(`Lark token API returned non-JSON (HTTP ${res.status})`);
  }

  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(
      `Lark token error ${json.code}: ${json.msg || `HTTP ${res.status}`}`,
    );
  }

  const expireSec = json.expire ?? 7200;
  tokenCache = {
    token: json.tenant_access_token,
    expiresAt: now + expireSec * 1000,
  };
  return json.tenant_access_token;
}

export type LarkContactUser = {
  open_id: string;
  name?: string;
  email?: string | null;
  enterprise_email?: string | null;
  status?: {
    is_activated?: boolean;
    is_resigned?: boolean;
    is_frozen?: boolean;
    is_exited?: boolean;
    is_unjoin?: boolean;
  };
};

async function listAuthorizedContactScope(token: string): Promise<{
  departmentIds: string[];
  userOpenIds: string[];
}> {
  const departmentIds: string[] = [];
  const userOpenIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      user_id_type: "open_id",
      department_id_type: "open_department_id",
      page_size: "100",
    });
    if (pageToken) params.set("page_token", pageToken);

    const data = await larkFetch<{
      department_ids?: string[];
      user_ids?: string[];
      has_more?: boolean;
      page_token?: string;
    }>(`/open-apis/contact/v3/scopes?${params}`, {
      method: "GET",
      token,
    });

    departmentIds.push(...(data.department_ids ?? []));
    userOpenIds.push(...(data.user_ids ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return { departmentIds, userOpenIds };
}

async function listChildDepartments(
  token: string,
  departmentId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      department_id_type: "open_department_id",
      fetch_child: "true",
      page_size: "50",
    });
    if (pageToken) params.set("page_token", pageToken);

    const data = await larkFetch<{
      items?: { open_department_id?: string }[];
      has_more?: boolean;
      page_token?: string;
    }>(
      `/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}/children?${params}`,
      { method: "GET", token },
    );

    for (const item of data.items ?? []) {
      if (item.open_department_id) ids.push(item.open_department_id);
    }
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return ids;
}

async function listUsersInDepartment(
  token: string,
  departmentId: string,
): Promise<LarkContactUser[]> {
  const users: LarkContactUser[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      department_id: departmentId,
      department_id_type: "open_department_id",
      user_id_type: "open_id",
      page_size: "50",
    });
    if (pageToken) params.set("page_token", pageToken);

    const data = await larkFetch<{
      items?: LarkContactUser[];
      has_more?: boolean;
      page_token?: string;
    }>(`/open-apis/contact/v3/users/find_by_department?${params}`, {
      method: "GET",
      token,
    });

    users.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return users;
}

async function batchGetUsersByOpenId(
  token: string,
  openIds: string[],
): Promise<LarkContactUser[]> {
  const users: LarkContactUser[] = [];
  const chunkSize = 50;

  for (let i = 0; i < openIds.length; i += chunkSize) {
    const chunk = openIds.slice(i, i + chunkSize);
    const params = new URLSearchParams({ user_id_type: "open_id" });
    for (const id of chunk) params.append("user_ids", id);

    const data = await larkFetch<{
      items?: LarkContactUser[];
    }>(`/open-apis/contact/v3/users/batch?${params}`, {
      method: "GET",
      token,
    });

    users.push(...(data.items ?? []));
  }

  return users;
}

/**
 * List users visible to this app's Contacts data permission.
 * Does not query root department "0" (that requires "All members" range).
 */
export async function listAllContactUsers(): Promise<LarkContactUser[]> {
  const token = await getTenantAccessToken();
  const byOpenId = new Map<string, LarkContactUser>();
  const deptErrors: string[] = [];

  const scope = await listAuthorizedContactScope(token);
  const departmentIds = new Set<string>(scope.departmentIds);

  for (const deptId of [...departmentIds]) {
    try {
      const children = await listChildDepartments(token, deptId);
      for (const id of children) departmentIds.add(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deptErrors.push(`children ${deptId}: ${msg}`);
    }
  }

  for (const departmentId of departmentIds) {
    try {
      const users = await listUsersInDepartment(token, departmentId);
      for (const user of users) {
        if (!user.open_id) continue;
        byOpenId.set(user.open_id, user);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deptErrors.push(`users ${departmentId}: ${msg}`);
    }
  }

  const missingUserIds = scope.userOpenIds.filter((id) => !byOpenId.has(id));
  if (missingUserIds.length > 0) {
    try {
      const users = await batchGetUsersByOpenId(token, missingUserIds);
      for (const user of users) {
        if (!user.open_id) continue;
        byOpenId.set(user.open_id, user);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deptErrors.push(`batch users: ${msg}`);
    }
  }

  if (byOpenId.size === 0) {
    throw new Error(
      "No Lark contacts returned. In Open Platform → Approval Connector → " +
        "Permissions → set Contacts availability / data permission to " +
        '"All members" (or include every department), then publish again. ' +
        (deptErrors[0] ? `Detail: ${deptErrors[0]}` : ""),
    );
  }

  return [...byOpenId.values()];
}

export type CreateApprovalInstanceInput = {
  approvalCode: string;
  openId: string;
  form: string;
  uuid?: string;
  /** node_id → open_id[] for initiator-selected approver nodes */
  nodeApproverOpenIdList?: { key: string; value: string[] }[];
};

export async function createApprovalInstance(
  input: CreateApprovalInstanceInput,
): Promise<{ instance_code: string }> {
  const token = await getTenantAccessToken();
  const body: Record<string, unknown> = {
    approval_code: input.approvalCode,
    open_id: input.openId,
    form: input.form,
  };
  if (input.uuid) body.uuid = input.uuid;
  if (input.nodeApproverOpenIdList?.length) {
    body.node_approver_open_id_list = input.nodeApproverOpenIdList;
  }

  return larkFetch<{ instance_code: string }>(
    "/open-apis/approval/v4/instances",
    {
      method: "POST",
      token,
      body: JSON.stringify(body),
    },
  );
}

export type ApprovalInstanceComment = {
  id: string;
  openId: string | null;
  userId: string | null;
  comment: string;
  createTime: string | null;
};

export type ApprovalInstanceDetails = {
  serial_number?: string;
  status?: string;
  approval_name?: string;
  open_id?: string;
  comment_list?: {
    id?: string;
    user_id?: string;
    open_id?: string;
    comment?: string;
    create_time?: string;
  }[];
};

/** Fetch approval instance details (includes serial_number + comments). */
export async function getApprovalInstance(
  instanceCode: string,
): Promise<ApprovalInstanceDetails> {
  const token = await getTenantAccessToken();
  return larkFetch<ApprovalInstanceDetails>(
    `/open-apis/approval/v4/instances/${encodeURIComponent(instanceCode)}?user_id_type=open_id`,
    { method: "GET", token },
  );
}

export type ApprovalInstanceSearchHit = {
  instanceCode: string;
  serialId: string | null;
  status: string | null;
  startTimeMs: string | null;
  approvalCode: string | null;
};

/**
 * Pull an instance_code out of raw user input: bare code, or a Lark URL /
 * applink that contains `instanceId=...`.
 */
export function extractLarkInstanceCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fromQuery = trimmed.match(/[?&]instanceId=([^&]+)/i);
  if (fromQuery?.[1]) {
    try {
      const decoded = decodeURIComponent(fromQuery[1]).trim();
      if (decoded) return decoded;
    } catch {
      const value = fromQuery[1].trim();
      if (value) return value;
    }
  }

  // Applink path= is often URL-encoded: path=...instanceId%3DCODE
  const fromEncodedPath = trimmed.match(/instanceId%3D([A-Za-z0-9_-]+)/i);
  if (fromEncodedPath?.[1]) return fromEncodedPath[1];

  // Bare UUID-style instance codes (with or without hyphens).
  if (
    /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(
      trimmed,
    )
  ) {
    return trimmed;
  }
  if (/^[0-9A-Fa-f]{32}$/.test(trimmed)) {
    return [
      trimmed.slice(0, 8),
      trimmed.slice(8, 12),
      trimmed.slice(12, 16),
      trimmed.slice(16, 20),
      trimmed.slice(20),
    ].join("-");
  }

  return null;
}

type QueryInstancesPage = {
  count?: number;
  instance_list?: {
    approval?: { code?: string };
    instance?: {
      code?: string;
      serial_id?: string;
      status?: string;
      start_time?: string;
    };
  }[];
  page_token?: string;
  has_more?: boolean;
};

/** Query Lark approval instances (requires approval:approval.list:readonly). */
export async function queryApprovalInstances(input: {
  approvalCode: string;
  pageSize?: number;
  pageToken?: string;
  instanceStatus?: string;
  startTimeFromMs?: string;
  startTimeToMs?: string;
}): Promise<QueryInstancesPage> {
  const token = await getTenantAccessToken();
  const params = new URLSearchParams({
    page_size: String(Math.min(200, Math.max(5, input.pageSize ?? 100))),
    user_id_type: "open_id",
  });
  if (input.pageToken) params.set("page_token", input.pageToken);

  const body: Record<string, unknown> = {
    approval_code: input.approvalCode,
    instance_status: input.instanceStatus ?? "ALL",
  };
  if (input.startTimeFromMs && input.startTimeToMs) {
    body.instance_start_time_from = input.startTimeFromMs;
    body.instance_start_time_to = input.startTimeToMs;
  }

  return larkFetch<QueryInstancesPage>(
    `/open-apis/approval/v4/instances/query?${params}`,
    {
      method: "POST",
      token,
      body: JSON.stringify(body),
    },
  );
}

function normalizeSerial(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function serialsMatch(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  return normalizeSerial(a) === normalizeSerial(b);
}

/**
 * Resolve a visible AP Form reference number (serial) to an instance_code by
 * scanning the configured approval definition. Optionally accepts a pasted
 * instance code / Lark URL instead.
 */
export async function resolveApprovalInstance(input: {
  referenceOrCode: string;
  /** Max pages to scan when looking up by serial (page size 100). */
  maxPages?: number;
}): Promise<ApprovalInstanceSearchHit> {
  const raw = input.referenceOrCode.trim();
  if (!raw) {
    throw new Error("Enter an AP Form reference number");
  }

  const asInstanceCode = extractLarkInstanceCode(raw);
  if (asInstanceCode) {
    const details = await getApprovalInstance(asInstanceCode);
    return {
      instanceCode: asInstanceCode,
      serialId: details.serial_number?.trim() || null,
      status: details.status?.trim() || null,
      startTimeMs: null,
      approvalCode: null,
    };
  }

  const serial = normalizeSerial(raw);
  const approvalCode = getLarkApprovalCode();
  const maxPages = input.maxPages ?? 30;
  let pageToken: string | undefined;

  try {
    for (let page = 0; page < maxPages; page++) {
      const data = await queryApprovalInstances({
        approvalCode,
        pageSize: 100,
        pageToken,
        instanceStatus: "ALL",
      });

      for (const item of data.instance_list ?? []) {
        const code = item.instance?.code?.trim();
        if (!code) continue;
        if (serialsMatch(item.instance?.serial_id, serial)) {
          return {
            instanceCode: code,
            serialId: item.instance?.serial_id?.trim() || serial,
            status: item.instance?.status?.trim() || null,
            startTimeMs: item.instance?.start_time?.trim() || null,
            approvalCode: item.approval?.code?.trim() || approvalCode,
          };
        }
      }

      if (!data.has_more || !data.page_token) break;
      pageToken = data.page_token;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/1390001|permission|scope|99991672|99991663/i.test(msg)) {
      throw new Error(
        `Could not search Lark by reference number (${msg}). ` +
          "Ensure the app has the “Query approval list” permission, or paste a Lark approval URL instead.",
      );
    }
    throw err;
  }

  throw new Error(
    `No Lark AP Form found with reference number “${serial}”. ` +
      "Check the number, or paste the Lark approval URL / instance code instead.",
  );
}

/**
 * Parse Lark comment payloads. Some tenants return plain text; others return
 * JSON like {"text":"..."} or richer rich-text structures.
 */
export function parseLarkCommentText(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return parsed.trim();
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.text === "string") return obj.text.trim();
      if (typeof obj.content === "string") return obj.content.trim();
      if (typeof obj.comment === "string") return obj.comment.trim();
      if (Array.isArray(obj.elements)) {
        const parts: string[] = [];
        for (const el of obj.elements) {
          if (!el || typeof el !== "object") continue;
          const text = (el as { text?: unknown }).text;
          if (typeof text === "string" && text.trim()) parts.push(text.trim());
        }
        if (parts.length) return parts.join("");
      }
    }
  } catch {
    // keep raw
  }
  return trimmed;
}

function normalizeCommentList(
  list: ApprovalInstanceDetails["comment_list"] | undefined,
): ApprovalInstanceComment[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      const id = item.id?.trim() || "";
      const comment = parseLarkCommentText(item.comment);
      if (!id && !comment) return null;
      const createMs = item.create_time?.trim();
      const createTime =
        createMs && /^\d+$/.test(createMs)
          ? new Date(Number(createMs)).toISOString()
          : createMs || null;
      return {
        id:
          id ||
          `${item.open_id ?? item.user_id ?? "anon"}-${createMs ?? comment}`,
        openId: item.open_id?.trim() || null,
        userId: item.user_id?.trim() || null,
        comment,
        createTime,
      } satisfies ApprovalInstanceComment;
    })
    .filter((c): c is ApprovalInstanceComment => !!c)
    .sort((a, b) => {
      const ta = a.createTime ? new Date(a.createTime).getTime() : 0;
      const tb = b.createTime ? new Date(b.createTime).getTime() : 0;
      return ta - tb;
    });
}

/** Dedicated comments endpoint (thread replies); best-effort fallback. */
export async function listApprovalInstanceComments(
  instanceCode: string,
): Promise<ApprovalInstanceComment[]> {
  const token = await getTenantAccessToken();
  try {
    const data = await larkFetch<{
      comments?: {
        id?: string;
        content?: string;
        create_time?: string;
        is_delete?: number;
        commentator?: string;
        commentator_list?: { open_id?: string; user_id?: string }[];
      }[];
    }>(
      `/open-apis/approval/v4/instances/${encodeURIComponent(instanceCode)}/comments?user_id_type=open_id`,
      { method: "GET", token },
    );

    return (data.comments ?? [])
      .filter((c) => c.is_delete !== 1)
      .map((item) => {
        const openId =
          item.commentator_list?.[0]?.open_id?.trim() ||
          item.commentator?.trim() ||
          null;
        const createMs = item.create_time?.trim();
        const createTime =
          createMs && /^\d+$/.test(createMs)
            ? new Date(Number(createMs)).toISOString()
            : createMs || null;
        return {
          id: item.id?.trim() || `${openId ?? "anon"}-${createMs ?? ""}`,
          openId,
          userId: item.commentator_list?.[0]?.user_id?.trim() || null,
          comment: parseLarkCommentText(item.content),
          createTime,
        } satisfies ApprovalInstanceComment;
      })
      .filter((c) => !!c.comment)
      .sort((a, b) => {
        const ta = a.createTime ? new Date(a.createTime).getTime() : 0;
        const tb = b.createTime ? new Date(b.createTime).getTime() : 0;
        return ta - tb;
      });
  } catch {
    return [];
  }
}

export type SyncedApprovalDetails = {
  serialNumber: string | null;
  status: string | null;
  comments: ApprovalInstanceComment[];
};

/** Fetch serial + status + comments, with short retries right after create. */
export async function getApprovalInstanceDetails(
  instanceCode: string,
  options?: { retries?: number },
): Promise<SyncedApprovalDetails> {
  const retries = options?.retries ?? 3;
  let last: SyncedApprovalDetails = {
    serialNumber: null,
    status: null,
    comments: [],
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    try {
      const details = await getApprovalInstance(instanceCode);
      let comments = normalizeCommentList(details.comment_list);
      if (comments.length === 0) {
        comments = await listApprovalInstanceComments(instanceCode);
      }
      last = {
        serialNumber: details.serial_number?.trim() || null,
        status: details.status?.trim().toUpperCase() || null,
        comments,
      };
      if (last.serialNumber || last.status) return last;
    } catch {
      // retry
    }
  }

  return last;
}

function approvalFileUploadUrl(): string {
  const base =
    process.env.LARK_APPROVAL_FILE_BASE_URL?.replace(/\/$/, "") ||
    "https://www.larksuite.com";
  return `${base}/approval/openapi/v2/file/upload`;
}

/** Upload one file for use in an approval attachmentV2 widget. Returns file code. */
export async function uploadApprovalAttachment(input: {
  filename: string;
  bytes: ArrayBuffer | Uint8Array | Buffer;
  /** Widget is attachmentV2 → use "attachment" (not "image"). */
  kind?: "attachment" | "image";
}): Promise<string> {
  const token = await getTenantAccessToken();
  const filename = input.filename.trim() || "file.bin";
  const kind = input.kind ?? "attachment";

  const bytes =
    input.bytes instanceof ArrayBuffer
      ? new Uint8Array(input.bytes)
      : new Uint8Array(input.bytes);

  const form = new FormData();
  form.append("name", filename);
  form.append("type", kind);
  form.append(
    "content",
    new Blob([
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    ]),
    filename,
  );

  let res: Response;
  try {
    res = await fetch(approvalFileUploadUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
  } catch (err) {
    throw formatFetchFailure(err, "Lark file upload unreachable");
  }

  let json: {
    code: number;
    msg?: string;
    data?: { code?: string; url?: string };
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new Error(`Lark file upload returned non-JSON (HTTP ${res.status})`);
  }

  if (json.code !== 0 || !json.data?.code) {
    throw new Error(
      `Lark file upload error ${json.code}: ${json.msg || `HTTP ${res.status}`}`,
    );
  }

  return json.data.code;
}
