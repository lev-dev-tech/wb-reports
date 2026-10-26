import { mkdir, writeFile } from "node:fs/promises";
import { collect } from "./collect.mjs";
import { seal } from "./seal.mjs";
import { demoData } from "./demo.mjs";
import { summarize } from "./summary.mjs";

const OUTPUT = new URL("../site/data.enc.json", import.meta.url);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Нет переменной ${name} (секрет репозитория)`);
  return value;
}

function refuseWithoutOrders(data) {
  const ordersError = data.errors.find(error => error.section === "Заказы");
  if (ordersError) throw new Error(`Заказы не получены, оставляю прошлую версию сайта: ${ordersError.message}`);
}

async function main() {
  const password = required("DASHBOARD_PASSWORD");
  const data = process.argv.includes("--demo") ? demoData() : await collect({ token: required("WB_API_TOKEN"), adsToken: process.env.WB_ADS_TOKEN || undefined });
  refuseWithoutOrders(data);
  data.summary = summarize(data);
  await mkdir(new URL("../site/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(await seal(data, password)));
  console.log(`Готово: дней ${data.days.length}, товаров ${data.products.length}, кампаний ${data.ads.campaigns.length}, остатков ${data.stocks.length}, ошибок ${data.errors.length}`);
  for (const error of data.errors) console.log(`Нет данных "${error.section}": ${error.message}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
