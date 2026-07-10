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

  const res = await fetch(`${larkBaseUrl()}${path}`, {
    ...rest,
    headers,
  });

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

  const res = await fetch(
    `${larkBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );

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

  const res = await fetch(approvalFileUploadUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

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
