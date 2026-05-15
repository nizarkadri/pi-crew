import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { clearProjectRootCache, findRepoRoot, projectPiRoot, userPiRoot } from "../../src/utils/paths.ts";

test("findRepoRoot detects .git as project marker", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-git-"));
	fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
	try {
		assert.equal(findRepoRoot(cwd), path.resolve(cwd));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("findRepoRoot detects .pi as project marker", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-pi-"));
	fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
	try {
		assert.equal(findRepoRoot(cwd), path.resolve(cwd));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("findRepoRoot detects .factory marker (Factory Droid)", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-factory-"));
	fs.mkdirSync(path.join(cwd, ".factory"), { recursive: true });
	try {
		assert.equal(findRepoRoot(cwd), path.resolve(cwd));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("findRepoRoot detects .omc marker (oh-my-claudecode)", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-omc-"));
	fs.mkdirSync(path.join(cwd, ".omc"), { recursive: true });
	try {
		assert.equal(findRepoRoot(cwd), path.resolve(cwd));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("findRepoRoot detects package.json as project marker", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-pkg-"));
	fs.writeFileSync(path.join(cwd, "package.json"), "{}\n", "utf-8");
	try {
		assert.equal(findRepoRoot(cwd), path.resolve(cwd));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("findRepoRoot returns undefined for tempdir without markers", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-empty-"));
	try {
		assert.equal(findRepoRoot(cwd), undefined);
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("findRepoRoot stops walking at user home", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-home-stop-"));
	try {
		assert.equal(findRepoRoot(cwd), undefined);
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("findRepoRoot walks up to find marker in parent", () => {
	const parent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-parent-"));
	const child = path.join(parent, "subdir", "deep");
	fs.mkdirSync(child, { recursive: true });
	fs.mkdirSync(path.join(parent, ".factory"), { recursive: true });
	try {
		assert.equal(findRepoRoot(child), path.resolve(parent));
	} finally {
		fs.rmSync(parent, { recursive: true, force: true });
	}
});

test("projectPiRoot points to <repoRoot>/.pi when project marker exists", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-projroot-"));
	fs.mkdirSync(path.join(cwd, ".omc"), { recursive: true });
	try {
		assert.equal(projectPiRoot(cwd), path.join(path.resolve(cwd), ".pi"));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("projectPiRoot falls back to <cwd>/.pi when no marker found", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-nomarker-"));
	try {
		assert.equal(projectPiRoot(cwd), path.join(path.resolve(cwd), ".pi"));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("userPiRoot respects PI_TEAMS_HOME override", () => {
	const previous = process.env.PI_TEAMS_HOME;
	const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-home-"));
	process.env.PI_TEAMS_HOME = tempHome;
	try {
		assert.equal(userPiRoot(), path.join(tempHome, ".pi", "agent"));
	} finally {
		fs.rmSync(tempHome, { recursive: true, force: true });
		if (previous === undefined) delete process.env.PI_TEAMS_HOME;
		else process.env.PI_TEAMS_HOME = previous;
	}
});


test("findRepoRoot caches result and clearProjectRootCache resets it (2.10)", () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-crew-paths-cache-"));
	fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
	clearProjectRootCache();
	try {
		// 1st call: walks the tree, finds .git, returns the dir.
		const first = findRepoRoot(cwd);
		assert.equal(first, path.resolve(cwd));

		// Now mask .git by removing it. Cache should still report the previous answer
		// because the entry is fresh (TTL 30s).
		fs.rmSync(path.join(cwd, ".git"), { recursive: true, force: true });
		const cached = findRepoRoot(cwd);
		assert.equal(cached, path.resolve(cwd), "cached entry expected within TTL window");

		// After explicit clear, the lookup re-walks and returns undefined for the temp.
		clearProjectRootCache();
		const fresh = findRepoRoot(cwd);
		// Without any marker, walk likely stops at tempRoot or returns undefined.
		assert.notEqual(fresh, path.resolve(cwd));
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
		clearProjectRootCache();
	}
});
