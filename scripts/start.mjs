import { runtimePort } from './runtime-port.mjs';
process.env.PORT = runtimePort();
// Managed hosts set HOSTNAME to the container ID. Bind the web listener to all
// container interfaces so the hosting proxy can reach it; retain assigned PORT.
process.env.HOSTNAME = '0.0.0.0';
process.env.NODE_ENV = 'production';
await import('../.next/standalone/server.js');
