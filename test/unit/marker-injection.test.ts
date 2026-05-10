import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKER_START,
  MARKER_END,
  injectGuidance,
  extractGuidanceIds,
  removeGuidance,
  standardGuidanceBlocks,
} from "../../src/config/markers.ts";

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-marker-test-")), "AGENTS.md");
}

function cleanup(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── inject into empty file ─────────────────────────────────────────

test("injectGuidance creates file when it does not exist", () => {
  const filePath = tmpFile();
  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  try {
    const result = injectGuidance(filePath, [
      { id: "intro", content: "# Hello" },
    ]);
    assert.equal(result.modified, true);
    assert.deepEqual(result.added, ["intro"]);
    assert.equal(result.removed.length, 0);
    assert.ok(fs.existsSync(filePath));

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes(MARKER_START));
    assert.ok(content.includes(MARKER_END));
    assert.ok(content.includes("# Hello"));
    assert.ok(content.includes("PI-CREW:BLOCK:intro"));
  } finally {
    cleanup(filePath);
  }
});

// ─── inject into file with existing content ─────────────────────────

test("injectGuidance appends markers to existing content", () => {
  const filePath = tmpFile();
  try {
    fs.writeFileSync(filePath, "# Existing Project\n\nSome content here.\n", "utf-8");

    const result = injectGuidance(filePath, [
      { id: "commands", content: "## Commands\n\n- team init" },
    ]);
    assert.equal(result.modified, true);
    assert.deepEqual(result.added, ["commands"]);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.startsWith("# Existing Project"));
    assert.ok(content.includes("Some content here."));
    assert.ok(content.includes(MARKER_START));
    assert.ok(content.includes("## Commands"));
    assert.ok(content.includes(MARKER_END));
  } finally {
    cleanup(filePath);
  }
});

// ─── update existing guidance (markers already present) ─────────────

test("injectGuidance updates existing blocks with same id", () => {
  const filePath = tmpFile();
  try {
    injectGuidance(filePath, [
      { id: "intro", content: "Version 1" },
    ]);

    const result = injectGuidance(filePath, [
      { id: "intro", content: "Version 2" },
    ]);
    assert.equal(result.modified, true);
    assert.deepEqual(result.added, ["intro"]);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("Version 2"));
    assert.ok(!content.includes("Version 1"));
    // Only one block
    const matches = content.match(/PI-CREW:BLOCK:intro/g);
    assert.equal(matches!.length, 1);
  } finally {
    cleanup(filePath);
  }
});

test("injectGuidance adds new block alongside existing ones", () => {
  const filePath = tmpFile();
  try {
    injectGuidance(filePath, [
      { id: "intro", content: "Hello" },
    ]);
    injectGuidance(filePath, [
      { id: "tips", content: "## Tips\n\nUse teams." },
    ]);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("PI-CREW:BLOCK:intro"));
    assert.ok(content.includes("PI-CREW:BLOCK:tips"));
    assert.ok(content.includes("Hello"));
    assert.ok(content.includes("Use teams."));
  } finally {
    cleanup(filePath);
  }
});

test("injectGuidance preserves content outside markers", () => {
  const filePath = tmpFile();
  try {
    fs.writeFileSync(filePath, "Header\n\nBody\n", "utf-8");
    injectGuidance(filePath, [{ id: "a", content: "A" }]);
    injectGuidance(filePath, [{ id: "b", content: "B" }]);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.startsWith("Header"));
    assert.ok(content.includes("Body"));
    assert.ok(content.includes("A"));
    assert.ok(content.includes("B"));
  } finally {
    cleanup(filePath);
  }
});

// ─── remove guidance ────────────────────────────────────────────────

test("removeGuidance removes entire marker section when no ids specified", () => {
  const filePath = tmpFile();
  try {
    fs.writeFileSync(filePath, "# Project\n\nBefore.\n", "utf-8");
    injectGuidance(filePath, [
      { id: "intro", content: "Guidance" },
      { id: "tips", content: "Tips" },
    ]);

    const result = removeGuidance(filePath);
    assert.equal(result.modified, true);
    assert.deepEqual(result.removed.sort(), ["intro", "tips"]);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(!content.includes(MARKER_START));
    assert.ok(!content.includes(MARKER_END));
    assert.ok(content.includes("# Project"));
    assert.ok(content.includes("Before."));
  } finally {
    cleanup(filePath);
  }
});

test("removeGuidance removes specific block ids", () => {
  const filePath = tmpFile();
  try {
    injectGuidance(filePath, [
      { id: "intro", content: "Intro" },
      { id: "commands", content: "Commands" },
      { id: "tips", content: "Tips" },
    ]);

    const result = removeGuidance(filePath, ["commands"]);
    assert.equal(result.modified, true);
    assert.deepEqual(result.removed, ["commands"]);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("PI-CREW:BLOCK:intro"));
    assert.ok(!content.includes("PI-CREW:BLOCK:commands"));
    assert.ok(content.includes("PI-CREW:BLOCK:tips"));
  } finally {
    cleanup(filePath);
  }
});

test("removeGuidance returns no-op when file does not exist", () => {
  const filePath = path.join(os.tmpdir(), `nonexistent-${Date.now()}.md`);
  const result = removeGuidance(filePath);
  assert.equal(result.modified, false);
  assert.deepEqual(result.removed, []);
});

test("removeGuidance returns no-op when no markers present", () => {
  const filePath = tmpFile();
  try {
    fs.writeFileSync(filePath, "Just content\n", "utf-8");
    const result = removeGuidance(filePath, ["intro"]);
    assert.equal(result.modified, false);
  } finally {
    cleanup(filePath);
  }
});

// ─── extract guidance IDs ───────────────────────────────────────────

test("extractGuidanceIds returns empty array for content without markers", () => {
  const ids = extractGuidanceIds("Just some markdown\n");
  assert.deepEqual(ids, []);
});

test("extractGuidanceIds returns ids from marker content", () => {
  const content = `${MARKER_START}
<!-- PI-CREW:BLOCK:intro -->
Hello
<!-- PI-CREW:/BLOCK:intro -->

<!-- PI-CREW:BLOCK:commands -->
## Commands
<!-- PI-CREW:/BLOCK:commands -->
${MARKER_END}`;

  const ids = extractGuidanceIds(content);
  assert.deepEqual(ids, ["intro", "commands"]);
});

// ─── multiple blocks with priorities ─────────────────────────────────

test("injectGuidance sorts blocks by priority (higher first)", () => {
  const filePath = tmpFile();
  try {
    const result = injectGuidance(filePath, [
      { id: "low", content: "Low priority", priority: 1 },
      { id: "high", content: "High priority", priority: 100 },
      { id: "mid", content: "Mid priority", priority: 50 },
    ]);
    assert.equal(result.modified, true);

    const content = fs.readFileSync(filePath, "utf-8");
    const highIdx = content.indexOf("High priority");
    const midIdx = content.indexOf("Mid priority");
    const lowIdx = content.indexOf("Low priority");
    assert.ok(highIdx < midIdx, "high should appear before mid");
    assert.ok(midIdx < lowIdx, "mid should appear before low");
  } finally {
    cleanup(filePath);
  }
});

test("blocks with no priority default to 0", () => {
  const filePath = tmpFile();
  try {
    injectGuidance(filePath, [
      { id: "no-prio", content: "No priority" },
      { id: "high", content: "High", priority: 10 },
    ]);

    const content = fs.readFileSync(filePath, "utf-8");
    const highIdx = content.indexOf("High");
    const noPrioIdx = content.indexOf("No priority");
    assert.ok(highIdx < noPrioIdx, "priority 10 should appear before default 0");
  } finally {
    cleanup(filePath);
  }
});

// ─── empty content signals removal via injectGuidance ────────────────

test("injectGuidance treats empty content as removal", () => {
  const filePath = tmpFile();
  try {
    injectGuidance(filePath, [
      { id: "a", content: "A" },
      { id: "b", content: "B" },
    ]);

    const result = injectGuidance(filePath, [
      { id: "a", content: "" },
    ]);
    assert.deepEqual(result.removed, ["a"]);
    assert.equal(result.added.length, 0);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(!content.includes("PI-CREW:BLOCK:a"));
    assert.ok(content.includes("PI-CREW:BLOCK:b"));
  } finally {
    cleanup(filePath);
  }
});

// ─── standardGuidanceBlocks ──────────────────────────────────────────

test("standardGuidanceBlocks returns valid blocks with version", () => {
  const blocks = standardGuidanceBlocks("1.2.3");
  assert.ok(blocks.length >= 2);
  assert.equal(blocks[0]!.id, "pi-crew-overview");
  assert.ok(blocks[0]!.content.includes("v1.2.3"));
  assert.ok(blocks[0]!.priority! > blocks[1]!.priority!);
  for (const block of blocks) {
    assert.ok(block.id.length > 0);
    assert.ok(block.content.length > 0);
  }
});

// ─── idempotency ─────────────────────────────────────────────────────

test("injectGuidance is idempotent when injecting same content", () => {
  const filePath = tmpFile();
  try {
    const blocks = [{ id: "x", content: "X" }];
    const first = injectGuidance(filePath, blocks);
    assert.equal(first.modified, true);

    const second = injectGuidance(filePath, blocks);
    assert.equal(second.modified, false);
  } finally {
    cleanup(filePath);
  }
});
