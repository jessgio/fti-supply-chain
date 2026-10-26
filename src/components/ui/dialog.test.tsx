import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog } from "./dialog";

test("dialog scroll container is not the flex box that centers the panel", () => {
  const html = renderToStaticMarkup(
    <Dialog open onClose={() => {}} title="Edit PO" description="Line items">
      <p>PKG-STC-ILP-LIPBUTTER</p>
    </Dialog>,
  );

  const scrollContainer = html.match(
    /<div class="([^"]*overflow-y-auto[^"]*)"/,
  );
  assert.ok(scrollContainer, "expected a scrollable dialog overlay");
  assert.equal(scrollContainer[1].includes("items-center"), false);
  assert.equal(scrollContainer[1].includes("flex"), false);

  const aligner = html.match(/<div class="(flex min-h-full[^"]*)"/);
  assert.ok(aligner, "expected a full-height flex aligner inside the scroller");
  assert.match(aligner[1], /sm:items-center/);
  assert.match(html, /Edit PO/);
  assert.match(html, /PKG-STC-ILP-LIPBUTTER/);
});
