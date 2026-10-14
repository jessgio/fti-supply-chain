import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeLarkFileUrl,
  isPrivateIpAddress,
  mergeLarkComments,
  mimeTypeForLarkFile,
  normalizeLarkComments,
  parseLarkCommentText,
  toClientLarkComments,
} from "./comment-files";

const PNG =
  "https://cdn.example.com/lark-approval-attachment/image/note.png?x-expires=1&x-signature=abc";

test("plain comment text is unchanged", () => {
  assert.equal(parseLarkCommentText("  please pay  "), "please pay");
});

test("json comment text is extracted and files are kept", () => {
  const raw = JSON.stringify({
    text: "invoice attached",
    files: [
      {
        url: PNG,
        fileSize: 186823,
        title: "invoice.png",
        type: "image",
      },
    ],
  });
  assert.equal(parseLarkCommentText(raw), "invoice attached");
  const [comment] = normalizeLarkComments([
    {
      id: "c1",
      open_id: "ou_alex",
      comment: raw,
      create_time: "1564590532967",
    },
  ]);
  assert.ok(comment);
  assert.equal(comment.comment, "invoice attached");
  assert.equal(comment.files.length, 1);
  assert.equal(comment.files[0]?.title, "invoice.png");
  assert.equal(comment.files[0]?.fileSize, 186823);
  assert.equal(comment.files[0]?.mimeType, "image/png");
  assert.equal(comment.openId, "ou_alex");
  assert.equal(comment.createTime, new Date(1564590532967).toISOString());
});

test("instance file_size attachments are kept, including attachment-only comments", () => {
  const [comment] = normalizeLarkComments([
    {
      id: "c2",
      open_id: "ou_bea",
      comment: "",
      create_time: "1564590532967",
      files: [
        {
          url: "https://cdn.example.com/file.pdf?x-expires=1\\u0026x-signature=abc",
          file_size: 1200,
          title: "PO.pdf",
          type: "attachment",
        },
      ],
    },
  ]);
  assert.ok(comment);
  assert.equal(comment.comment, "");
  assert.equal(comment.files[0]?.title, "PO.pdf");
  assert.equal(comment.files[0]?.mimeType, "application/pdf");
  assert.equal(comment.files[0]?.fileSize, 1200);
  assert.match(comment.files[0]?.url ?? "", /x-expires=1&x-signature=abc/);
});

test("replies are included and deleted comments are skipped", () => {
  const comments = normalizeLarkComments([
    {
      id: "parent",
      content: JSON.stringify({ text: "see file" }),
      create_time: "1000",
      commentator: "ou_parent",
      is_delete: 0,
      replies: [
        {
          id: "reply",
          content: JSON.stringify({
            text: "",
            files: [{ url: PNG, fileSize: 10, title: "photo.jpg", type: "image" }],
          }),
          create_time: "2000",
          commentator: "ou_reply",
          is_delete: 0,
        },
        {
          id: "gone",
          content: "deleted",
          create_time: "3000",
          is_delete: 1,
        },
      ],
    },
  ]);
  assert.deepEqual(
    comments.map((comment) => comment.id),
    ["parent", "reply"],
  );
  assert.equal(comments[1]?.files[0]?.title, "photo.jpg");
  assert.equal(comments[1]?.files[0]?.mimeType, "image/jpeg");
});

test("instance files and thread files merge without dropping either source", () => {
  const fromInstance = normalizeLarkComments([
    {
      id: "c1",
      open_id: "ou_alex",
      comment: "ok",
      create_time: "5000",
      files: [
        {
          url: "https://cdn.example.com/a.pdf",
          file_size: 10,
          title: "a.pdf",
          type: "attachment",
        },
      ],
    },
  ]);
  const fromThread = normalizeLarkComments([
    {
      id: "c1",
      content: JSON.stringify({
        text: "ok",
        files: [{ url: PNG, fileSize: 20, title: "shot.png", type: "image" }],
      }),
      create_time: "5000",
      commentator: "ou_alex",
      replies: [
        {
          id: "c2",
          content: "reply",
          create_time: "6000",
          commentator: "ou_bea",
        },
      ],
    },
  ]);
  const merged = mergeLarkComments(fromInstance, fromThread);
  assert.deepEqual(
    merged.map((comment) => comment.id),
    ["c1", "c2"],
  );
  assert.deepEqual(
    merged[0]?.files.map((file) => file.title),
    ["a.pdf", "shot.png"],
  );
});

test("unsafe attachment urls are dropped", () => {
  const [comment] = normalizeLarkComments([
    {
      id: "c3",
      comment: "files",
      create_time: "1000",
      files: [
        { url: "http://cdn.example.com/a.pdf", title: "a.pdf", type: "attachment" },
        { url: "https://127.0.0.1/secret.pdf", title: "secret.pdf", type: "attachment" },
        { url: "https://10.0.0.8/a.pdf", title: "lan.pdf", type: "attachment" },
        { url: PNG, title: "ok.png", type: "image" },
      ],
    },
  ]);
  assert.deepEqual(
    comment?.files.map((file) => file.title),
    ["ok.png"],
  );
});

test("client comments omit signed urls", () => {
  const [comment] = normalizeLarkComments([
    {
      id: "c4",
      comment: "hi",
      create_time: "1000",
      files: [{ url: PNG, fileSize: 4, title: "ok.png", type: "image" }],
    },
  ]);
  assert.ok(comment);
  const [client] = toClientLarkComments([comment]);
  assert.equal(client?.files[0]?.title, "ok.png");
  assert.equal("url" in (client?.files[0] ?? {}), false);
});

test("private addresses are rejected", () => {
  assert.equal(isPrivateIpAddress("8.8.8.8"), false);
  assert.equal(isPrivateIpAddress("10.1.1.1"), true);
  assert.equal(isPrivateIpAddress("169.254.169.254"), true);
  assert.equal(isPrivateIpAddress("::1"), true);
  assert.throws(() => assertSafeLarkFileUrl("https://user:pass@cdn.example.com/a"));
  assert.equal(
    assertSafeLarkFileUrl("https://cdn.example.com/a.png?a=1\\u0026b=2").search,
    "?a=1&b=2",
  );
});

test("svg is not given an inline image mime", () => {
  assert.equal(mimeTypeForLarkFile("logo.svg", "image"), null);
  assert.equal(mimeTypeForLarkFile("scan.png", "image"), "image/png");
});
