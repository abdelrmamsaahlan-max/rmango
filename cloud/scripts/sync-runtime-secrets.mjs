import { spawn } from "node:child_process";

const requiredSecrets = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
];

const values = Object.fromEntries(
  requiredSecrets.map((name) => [name, process.env[name]?.trim() ?? ""]),
);

for (const name of requiredSecrets) {
  if (!values[name]) {
    throw new Error(
      "Missing protected Cloudflare build secret " + name +
      ". Configure it in the Production build environment before deploying.",
    );
  }
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(values.SUPABASE_URL)) {
  throw new Error("SUPABASE_URL is not a valid Supabase project URL.");
}
if (!values.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
  throw new Error("SUPABASE_PUBLISHABLE_KEY must be the project's sb_publishable_ key.");
}
if (!values.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) {
  throw new Error("SUPABASE_SECRET_KEY must be the project's sb_secret_ key.");
}

function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      command,
      ["wrangler", "secret", "put", name, "--name", "rmango"],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["pipe", "inherit", "inherit"],
        windowsHide: true,
      },
    );

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Wrangler could not install runtime secret " + name + "."));
    });

    // Pipe the value directly to Wrangler. Never pass it in argv or print it.
    child.stdin.end(value + "\n", "utf8");
  });
}

for (const name of requiredSecrets) {
  console.log("Installing protected runtime secret: " + name);
  await putSecret(name, values[name]);
}

console.log("All required Supabase runtime secrets are installed.");
