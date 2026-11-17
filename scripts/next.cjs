#!/usr/bin/env node
'use strict';

/**
 * Runs the Next.js CLI with the filesystem shim preloaded in this process and
 * in every worker process (via NODE_OPTIONS), so builds also work on exFAT
 * volumes where readlink() reports EISDIR for regular files.
 */

const path = require('path');
const { spawn } = require('child_process');

const patchPath = path.join(__dirname, 'patch-fs.cjs').replace(/\\/g, '/');
const existingNodeOptions = process.env.NODE_OPTIONS || '';

if (!existingNodeOptions.includes('patch-fs.cjs')) {
  process.env.NODE_OPTIONS = `${existingNodeOptions} --require "${patchPath}"`.trim();
}

const nextPackage = require.resolve('next/package.json');
const nextBin = path.join(path.dirname(nextPackage), 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
