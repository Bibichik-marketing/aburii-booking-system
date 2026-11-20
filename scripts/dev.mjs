import { spawn } from 'node:child_process';
import { runtimePort } from './runtime-port.mjs';
const child = spawn(process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '0.0.0.0', '--port', runtimePort()],
  { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Unable to start Next.js development server.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
