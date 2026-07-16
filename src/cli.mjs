import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import fg from "fast-glob";
import { lint } from "markdownlint/sync";
import { katexRule, katexRuleName } from "./katex-rule.mjs";

/** `successExitCode` is returned when every notebook Markdown cell passes. */
const successExitCode = 0;

/** `lintFailureExitCode` is returned when KaTeX diagnostics were emitted. */
const lintFailureExitCode = 1;

/** `usageErrorExitCode` is returned for CLI usage, glob, file, or JSON errors. */
const usageErrorExitCode = 2;

/** `usageText` documents the required notebook path or glob arguments. */
const usageText = "Usage: lint-katex-ipynb <notebook.ipynb-or-glob> [more-notebooks-or-globs...]";

/** `globOptions` keeps glob expansion limited to real files, including dotfiles. */
const globOptions = {
  onlyFiles: true,
  unique: true,
  dot: true,
};

/** `CliError` marks expected user-facing CLI and file errors. */
class CliError extends Error {
  /** `CliError` stores a message that can be printed without a stack trace. */
  constructor(message) {
    super(message);
    this.name = "CliError";
  }
}

/** `runCli` executes the notebook KaTeX linter and returns its process exit code. */
export async function runCli(args, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const cwd = options.cwd ?? process.cwd();

  if (isHelpRequest(args)) {
    stderr.write(`${usageText}\n`);
    return successExitCode;
  }

  if (args.length === 0) {
    stderr.write(`${usageText}\n`);
    return usageErrorExitCode;
  }

  try {
    const targets = await expandTargets(args, cwd);
    const diagnostics = [];

    for (const target of targets) {
      diagnostics.push(...await lintNotebook(target));
    }

    for (const diagnostic of diagnostics) {
      stdout.write(`${formatDiagnostic(diagnostic)}\n`);
    }

    return diagnostics.length > 0 ? lintFailureExitCode : successExitCode;
  } catch (error) {
    if (error instanceof CliError) {
      stderr.write(`${error.message}\n`);
      return usageErrorExitCode;
    }

    throw error;
  }
}

/** `isHelpRequest` returns true when `args` asks for command usage text. */
function isHelpRequest(args) {
  return args.length === 1 && (args[0] === "--help" || args[0] === "-h");
}

/** `expandTargets` resolves notebook path and glob arguments into lint targets. */
async function expandTargets(args, cwd) {
  const targets = [];
  const seenPaths = new Set();

  for (const arg of args) {
    const matches = await fg(arg, { ...globOptions, cwd });

    if (matches.length === 0) {
      throw new CliError(`No notebook matched: ${arg}`);
    }

    for (const match of matches) {
      const filePath = path.resolve(cwd, match);

      if (path.extname(match) !== ".ipynb") {
        throw new CliError(`Not a .ipynb file: ${match}`);
      }

      if (!seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        targets.push({
          filePath,
          displayPath: match,
        });
      }
    }
  }

  return targets;
}

/** `lintNotebook` reads a notebook target and lints only its Markdown cells. */
async function lintNotebook(target) {
  const notebook = await readNotebook(target);
  const diagnostics = [];

  for (const cell of markdownCells(notebook)) {
    const result = lint({
      strings: {
        [cell.name]: cell.markdown,
      },
      customRules: [katexRule],
      config: {
        default: false,
        [katexRuleName]: true,
      },
      noInlineConfig: true,
    });

    for (const error of result[cell.name] ?? []) {
      diagnostics.push({
        target,
        cellIndex: cell.index,
        error,
      });
    }
  }

  return diagnostics;
}

/** `readNotebook` parses notebook JSON and converts malformed input to CLI errors. */
async function readNotebook(target) {
  let source;

  try {
    source = await fs.readFile(target.filePath, "utf8");
  } catch (error) {
    throw new CliError(`Could not read ${target.displayPath}: ${error.message}`);
  }

  try {
    const notebook = JSON.parse(source);

    if (!Array.isArray(notebook.cells)) {
      throw new CliError(`Notebook has no cells array: ${target.displayPath}`);
    }

    return notebook;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError(`Could not parse ${target.displayPath}: ${error.message}`);
  }
}

/** `markdownCells` returns notebook Markdown cells with their zero-based cell index. */
function markdownCells(notebook) {
  const cells = [];

  for (const [index, cell] of notebook.cells.entries()) {
    if (cell?.cell_type === "markdown") {
      cells.push({
        index,
        name: `cell-${index}`,
        markdown: sourceToMarkdown(cell.source),
      });
    }
  }

  return cells;
}

/** `sourceToMarkdown` joins notebook cell source arrays using notebook order. */
function sourceToMarkdown(source) {
  if (Array.isArray(source)) {
    return source.join("");
  }

  if (typeof source === "string") {
    return source;
  }

  return "";
}

/** `formatDiagnostic` renders the required notebook:cell:line:column message. */
function formatDiagnostic(diagnostic) {
  const { target, cellIndex, error } = diagnostic;
  const lineNumber = error.lineNumber;
  const column = error.errorRange?.[0] ?? 1;
  const message = error.errorDetail ?? error.ruleDescription;

  return `${target.displayPath}:cell:${cellIndex}:${lineNumber}:${column}: ${message}`;
}
