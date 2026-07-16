import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

/** `projectRoot` points tests at the package root containing the CLI bin. */
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** `cliPath` is the executable module used by spawned CLI tests. */
const cliPath = path.join(projectRoot, "bin", "lint-katex-ipynb.mjs");

/** `withTempDir` runs `callback` in an isolated temporary directory. */
async function withTempDir(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lint-katex-ipynb-"));

  return callback(directory);
}

/** `writeNotebook` writes `cells` as a minimal Jupyter notebook at `filePath`. */
async function writeNotebook(filePath, cells) {
  await fs.writeFile(filePath, `${JSON.stringify({
    cells,
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  }, null, 2)}\n`);
}

/** `runCli` spawns the package CLI with `args` inside `cwd`. */
function runCli(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("passing notebook math exits successfully", async () => withTempDir(async (directory) => {
  await writeNotebook(path.join(directory, "pass.ipynb"), [
    {
      cell_type: "markdown",
      metadata: {},
      source: [
        "Inline $x+1$.\n",
        "\n",
        "$$\n",
        "\\widecheck{X}\n",
        "$$\n",
        "Normal Markdown.\n",
      ],
    },
    {
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: [],
      source: "$\\badcommand{X}$\n",
    },
  ]);

  const result = await runCli(["pass.ipynb"], directory);

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
}));

test("failing notebook math prints cell-relative line and column", async () => withTempDir(async (directory) => {
  await writeNotebook(path.join(directory, "bad.ipynb"), [
    {
      cell_type: "markdown",
      metadata: {},
      source: "Bad $\\badcommand{X}$\n",
    },
  ]);

  const result = await runCli(["bad.ipynb"], directory);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /^bad\.ipynb:cell:0:1:6: KaTeX parse error: Undefined control sequence/u);
  assert.equal(result.stderr, "");
}));

test("code spans and code fences containing dollars are ignored", async () => withTempDir(async (directory) => {
  await writeNotebook(path.join(directory, "code.ipynb"), [
    {
      cell_type: "markdown",
      metadata: {},
      source: [
        "Inline code `$\\badcommand{X}$`.\n",
        "\n",
        "```\n",
        "$\\badcommand{X}$\n",
        "```\n",
      ],
    },
  ]);

  const result = await runCli(["code.ipynb"], directory);

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
}));

test("latex parenthesis and bracket delimiters are outside markdownlint-native scope", async () => withTempDir(async (directory) => {
  await writeNotebook(path.join(directory, "latex-delimiters.ipynb"), [
    {
      cell_type: "markdown",
      metadata: {},
      source: [
        "\\(\\badcommand{X}\\)\n",
        "\\[\\badcommand{X}\\]\n",
      ],
    },
  ]);

  const result = await runCli(["latex-delimiters.ipynb"], directory);

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
}));

test("glob arguments lint multiple notebooks", async () => withTempDir(async (directory) => {
  await writeNotebook(path.join(directory, "a.ipynb"), [
    {
      cell_type: "markdown",
      metadata: {},
      source: "$x+1$\n",
    },
  ]);
  await writeNotebook(path.join(directory, "b.ipynb"), [
    {
      cell_type: "markdown",
      metadata: {},
      source: "$\\badcommand{X}$\n",
    },
  ]);

  const result = await runCli(["*.ipynb"], directory);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /b\.ipynb:cell:0:1:2: KaTeX parse error/u);
  assert.doesNotMatch(result.stdout, /a\.ipynb/u);
  assert.equal(result.stderr, "");
}));

test("unmatched globs exit as CLI errors", async () => withTempDir(async (directory) => {
  const result = await runCli(["missing-*.ipynb"], directory);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^No notebook matched: missing-\*\.ipynb/u);
}));

test("non-notebook paths exit as CLI errors", async () => withTempDir(async (directory) => {
  await fs.writeFile(path.join(directory, "notes.md"), "$x+1$\n");

  const result = await runCli(["notes.md"], directory);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Not a \.ipynb file: notes\.md/u);
}));
