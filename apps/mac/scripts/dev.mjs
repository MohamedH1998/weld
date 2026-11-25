// Runs the page's dev server and opens the app on it.
import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";

const server = await createServer({ server: { port: 3210, strictPort: true } });
await server.listen();
const app = spawn(String(electron), ["."], { stdio: "inherit", env: { ...process.env, WELD_DEV_URL: "http://localhost:3210" } });
app.on("exit", async () => {
  await server.close();
  process.exit(0);
});
