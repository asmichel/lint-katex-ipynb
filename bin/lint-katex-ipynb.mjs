#!/usr/bin/env node

import process from "node:process";
import { runCli } from "../src/cli.mjs";

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: process.cwd(),
  });
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exitCode = 2;
}
