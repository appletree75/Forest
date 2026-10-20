import { spawn } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const portFlagIndex = args.findIndex((arg) => arg === "-p" || arg === "--port");
const inlinePort = args.find((arg) => arg.startsWith("--port="));
const port = portFlagIndex >= 0
  ? args[portFlagIndex + 1]
  : inlinePort?.slice("--port=".length) || process.env.PORT || "3000";

if (!/^\d{1,5}$/.test(port) || Number(port) > 65535) {
  throw new Error(`Invalid dev server port: ${port}`);
}

const nextArgs = args.some((arg) => arg === "-p" || arg === "--port" || arg.startsWith("--port="))
  ? args
  : [...args, "-p", port];
const child = spawn(
  process.execPath,
  [
    "--dns-result-order=ipv4first",
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    ...nextArgs,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, NEX_DEV_DIST_DIR: `.next-dev-${port}` },
  },
);

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
