import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import sodium from "libsodium-wrappers";

const REPO = "lev-dev-tech/wb-reports";
const WORKFLOW = "update.yml";
const TOKEN_FILE = join(homedir(), ".wb-reports", "github-token");
const ALLOWED_SECRETS = ["WB_API_TOKEN", "DASHBOARD_PASSWORD", "ALERT_BOT_TOKEN", "ALERT_CHAT_ID"];

function githubToken() {
  const token = readFileSync(TOKEN_FILE, "utf8").trim();
  if (!token) throw new Error(`Пустой токен GitHub в ${TOKEN_FILE}`);
  return token;
}

async function github(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 || response.status === 201 ? null : response.json();
}

async function sealForRepo(value) {
  await sodium.ready;
  const { key, key_id } = await github("/actions/secrets/public-key");
  const sealed = sodium.crypto_box_seal(
    sodium.from_string(value),
    sodium.from_base64(key, sodium.base64_variants.ORIGINAL),
  );
  return { encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id };
}

function readValue(source) {
  const value = (source ? readFileSync(source, "utf8") : readFileSync(0, "utf8")).trim();
  if (!value) throw new Error("Пустое значение секрета");
  return value;
}

async function setSecret(name, source) {
  if (!ALLOWED_SECRETS.includes(name)) throw new Error(`Неизвестный секрет ${name}`);
  await github(`/actions/secrets/${name}`, { method: "PUT", body: await sealForRepo(readValue(source)) });
  console.log(`Секрет ${name} сохранен`);
}

async function runWorkflow() {
  await github(`/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: { ref: "main" } });
  console.log("Обновление запущено");
}

async function lastRuns() {
  const { workflow_runs: runs } = await github("/actions/runs?per_page=5");
  for (const run of runs) {
    console.log(`${run.created_at} ${run.event} ${run.status} ${run.conclusion ?? "-"} ${run.html_url}`);
  }
}

async function secretNames() {
  const { secrets } = await github("/actions/secrets");
  console.log(secrets.map((secret) => `${secret.name} (${secret.updated_at})`).join("\n") || "Секретов нет");
}

const [command, ...args] = process.argv.slice(2);
const commands = {
  secret: () => setSecret(args[0], args[1]),
  secrets: secretNames,
  run: runWorkflow,
  status: lastRuns,
};

if (!commands[command]) {
  console.error("Команды: secret <ИМЯ> [файл], secrets, run, status");
  process.exit(1);
}
await commands[command]();
