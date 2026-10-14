import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LarkCommentThread } from "./lark-comment-thread";

test("comment thread lists attachments with preview and download", () => {
  const html = renderToStaticMarkup(
    <LarkCommentThread
      comments={[
        {
          id: "c1",
          openId: null,
          comment: "see scan",
          createTime: "2024-01-02T03:04:00.000Z",
          authorName: "Alex",
          authorEmail: null,
          files: [
            {
              title: "scan.png",
              fileSize: 2048,
              type: "image",
              mimeType: "image/png",
            },
            {
              title: "notes.xlsx",
              fileSize: 4096,
              type: "attachment",
              mimeType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ],
        },
      ]}
      fileHref={() => "/file"}
    />,
  );

  assert.match(html, /Alex/);
  assert.match(html, /see scan/);
  assert.match(html, /scan\.png/);
  assert.match(html, /notes\.xlsx/);
  assert.equal((html.match(/Preview/g) ?? []).length, 1);
  assert.equal((html.match(/Download/g) ?? []).length, 2);
});

test("attachment-only comments do not show an empty placeholder", () => {
  const html = renderToStaticMarkup(
    <LarkCommentThread
      comments={[
        {
          id: "c2",
          openId: null,
          comment: "",
          createTime: null,
          authorName: null,
          authorEmail: null,
          files: [
            {
              title: "photo.jpg",
              fileSize: null,
              type: "image",
              mimeType: "image/jpeg",
            },
          ],
        },
      ]}
      fileHref={() => "/file"}
    />,
  );

  assert.equal(html.includes("(empty comment)"), false);
  assert.match(html, /photo\.jpg/);
  assert.match(html, /Preview/);
});
