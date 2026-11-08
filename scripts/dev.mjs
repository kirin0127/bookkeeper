import { spawn } from 'node:child_process';

const processes = ['backend', 'frontend'].map(workspace => spawn(
  process.execPath, [process.env.npm_execpath, 'run', 'dev', '--workspace', workspace], { stdio: 'inherit' },
));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  processes.forEach(child => child.kill('SIGTERM'));
  process.exitCode = code;
}
processes.forEach(child => {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 1));
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
