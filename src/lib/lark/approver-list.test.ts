import assert from "node:assert/strict";
import test from "node:test";
import {
  isDirectoryDefaultApprover,
  orderApproversForForm,
  type ApproverListEntry,
} from "./approver-list";

function person(
  name: string,
  openId: string,
  isDefault = false,
): ApproverListEntry {
  return {
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    full_name: name,
    lark_open_id: openId,
    is_default_approver: isDefault,
  };
}

const directory = [
  person("Zoe Default", "ou_zoe", true),
  person("Alex", "ou_alex"),
  person("Bea Default", "ou_bea", true),
  person("Cara", "ou_cara"),
];

test("checked default approvers stay at the top, alphabetically", () => {
  const ordered = orderApproversForForm(directory, ["ou_zoe", "ou_bea"]);
  assert.deepEqual(
    ordered.map((c) => c.full_name),
    ["Bea Default", "Zoe Default", "Alex", "Cara"],
  );
});

test("unchecking a default returns them to alphabetical order", () => {
  const ordered = orderApproversForForm(directory, ["ou_bea"]);
  assert.deepEqual(
    ordered.map((c) => c.full_name),
    ["Bea Default", "Alex", "Cara", "Zoe Default"],
  );
});

test("unchecking every default restores a single alphabetical list", () => {
  const ordered = orderApproversForForm(directory, []);
  assert.deepEqual(
    ordered.map((c) => c.full_name),
    ["Alex", "Bea Default", "Cara", "Zoe Default"],
  );
});

test("rechecking a default moves them back to the top", () => {
  const rechecked = orderApproversForForm(directory, ["ou_zoe"]);
  assert.deepEqual(
    rechecked.map((c) => c.full_name),
    ["Zoe Default", "Alex", "Bea Default", "Cara"],
  );
});

test("an env open id does not keep an unchecked directory row as a default", () => {
  const openId = "ou_unchecked";
  assert.equal(
    isDirectoryDefaultApprover(
      { is_default_approver: false },
      [openId],
    ),
    false,
  );
  assert.equal(
    isDirectoryDefaultApprover(
      { is_default_approver: true },
      [],
    ),
    true,
  );
});

test("manually selected non-defaults stay in alphabetical order", () => {
  const ordered = orderApproversForForm(directory, ["ou_cara", "ou_bea"]);
  assert.deepEqual(
    ordered.map((c) => c.full_name),
    ["Bea Default", "Alex", "Cara", "Zoe Default"],
  );
});
