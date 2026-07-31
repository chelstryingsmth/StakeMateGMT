const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const node = process.execPath;
const children = [];
let stopping = false;

function launch(label, args) {
  const child = spawn(node, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (stopping) return;
    if (code && code !== 0) {
      console.error(`${label} stopped with exit code ${code}.`);
      shutdown(code);
    }
  });
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

launch("Evidence API", [
  "--env-file-if-exists=.env",
  path.join(root, "backend", "src", "server.js"),
]);
launch("Website", [
  path.join(root, "node_modules", "vite", "bin", "vite.js"),
]);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
