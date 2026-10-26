import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const nextCli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const environment = {
    ...process.env,
    NEXT_PUBLIC_UX16_CALM_WORKSPACE: 'true',
};

const build = spawnSync(process.execPath, [nextCli, 'build'], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(
    process.execPath,
    [nextCli, 'start', '--hostname', '127.0.0.1', '--port', '3011'],
    {
        cwd: process.cwd(),
        env: environment,
        stdio: 'inherit',
    },
);

const stopServer = () => {
    if (!server.killed) server.kill('SIGTERM');
};

process.once('SIGINT', stopServer);
process.once('SIGTERM', stopServer);
server.once('error', (error) => {
    throw error;
});
server.once('exit', (code) => {
    process.exit(code ?? 0);
});
