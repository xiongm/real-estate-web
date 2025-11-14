#!/usr/bin/env node

const { spawn } = require('node:child_process');

const port = Number(process.env.PORT) || 3000;
const child = spawn('next', ['dev', '-p', String(port)], {
  stdio: 'inherit',
  env: process.env,
  shell: true
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
