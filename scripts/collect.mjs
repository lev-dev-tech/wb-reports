const STATISTICS = "https://statistics-api.wildberries.ru";
const ADVERT = "https://advert-api.wildberries.ru";
const MARKETPLACE = "https://marketplace-api.wildberries.ru";
const CONTENT = "https://content-api.wildberries.ru";
const PERIOD_DAYS = 30;
const ACTIVE_CAMPAIGN_STATUSES = new Set([7, 9, 11]);
const FULLSTATS_BATCH = 50;
const STOCKS_BATCH = 1000;
const ADVERT_PAUSE_MS = 21000;
const RETRY_PAUSE_MS = 65000;
const DAY_MS = 86400000;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const isoDate = date => date.toISOString().slice(0, 10);
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

async function request(url, token, options = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: token, "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (response.status === 429 && attempt < 3) {
      await pause(RETRY_PAUSE_MS);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${new URL(url).pathname}: ${(await response.text()).slice(0, 200)}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}

function periodBounds(now = new Date()) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - (PERIOD_DAYS - 1) * DAY_MS);
  return { from: isoDate(from), to: isoDate(to) };
}

async function statisticsRows(path, token, period) {
  const rows = await request(`${STATISTICS}${path}?dateFrom=${period.from}&flag=0`, token);
  return (rows || []).filter(row => String(row.date).slice(0, 10) >= period.from);
}

function emptyDay(date) {
  return { date, ordersCount: 0, ordersSum: 0, cancelCount: 0, salesCount: 0, salesSum: 0, returnsCount: 0 };
}

function dailyTotals(orders, sales, period) {
  const days = new Map();
  for (let time = Date.parse(period.from); time <= Date.parse(period.to); time += DAY_MS) days.set(isoDate(new Date(time)), emptyDay(isoDate(new Date(time))));
  for (const order of orders) {
    const day = days.get(String(order.date).slice(0, 10));
    if (!day) continue;
    if (order.isCancel) { day.cancelCount += 1; continue; }
    day.ordersCount += 1;
    day.ordersSum += Number(order.priceWithDisc) || 0;
  }
  for (const sale of sales) {
    const day = days.get(String(sale.date).slice(0, 10));
    if (!day) continue;
    if (String(sale.saleID).startsWith("R")) { day.returnsCount += 1; continue; }
    day.salesCount += 1;
    day.salesSum += Number(sale.priceWithDisc) || 0;
  }
  return [...days.values()];
}

function productTotals(orders, sales) {
  const products = new Map();
  const productOf = row => {
    if (!products.has(row.nmId)) {
      products.set(row.nmId, { nmId: row.nmId, article: row.supplierArticle, subject: row.subject, brand: row.brand, orders: 0, ordersSum: 0, sales: 0, salesSum: 0, returns: 0 });
    }
    return products.get(row.nmId);
  };
  for (const order of orders.filter(order => !order.isCancel)) {
    const product = productOf(order);
    product.orders += 1;
    product.ordersSum += Number(order.priceWithDisc) || 0;
  }
  for (const sale of sales) {
    const product = productOf(sale);
    if (String(sale.saleID).startsWith("R")) { product.returns += 1; continue; }
    product.sales += 1;
    product.salesSum += Number(sale.priceWithDisc) || 0;
  }
  return [...products.values()].sort((a, b) => b.ordersSum - a.ordersSum);
}

function regionTotals(orders) {
  const regions = new Map();
  for (const order of orders.filter(order => !order.isCancel)) {
    const name = order.regionName || "не указан";
    regions.set(name, (regions.get(name) || 0) + 1);
  }
  return [...regions.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
}

async function campaignIds(token) {
  const groups = (await request(`${ADVERT}/adv/v1/promotion/count`, token))?.adverts || [];
  return groups
    .filter(group => ACTIVE_CAMPAIGN_STATUSES.has(group.status))
    .flatMap(group => (group.advert_list || []).map(advert => ({ id: advert.advertId, type: group.type, status: group.status })));
}

function campaignRow(stat, meta) {
  const orders = Number(stat.orders) || 0;
  const spent = Number(stat.sum) || 0;
  const ordersSum = Number(stat.sum_price) || 0;
  return {
    id: stat.advertId, status: meta?.status, type: meta?.type,
    views: Number(stat.views) || 0, clicks: Number(stat.clicks) || 0, ctr: Number(stat.ctr) || 0, cpc: Number(stat.cpc) || 0,
    spent, carts: Number(stat.atbs) || 0, orders, ordersSum, drr: ordersSum ? (spent / ordersSum) * 100 : null,
  };
}

function adDays(stats) {
  const days = new Map();
  for (const stat of stats) {
    for (const day of stat.days || []) {
      const date = String(day.date).slice(0, 10);
      const total = days.get(date) || { date, views: 0, clicks: 0, spent: 0, orders: 0 };
      total.views += Number(day.views) || 0;
      total.clicks += Number(day.clicks) || 0;
      total.spent += Number(day.sum) || 0;
      total.orders += Number(day.orders) || 0;
      days.set(date, total);
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function advertising(token, period) {
  const campaigns = await campaignIds(token);
  if (!campaigns.length) return { campaigns: [], days: [] };
  const meta = new Map(campaigns.map(campaign => [campaign.id, campaign]));
  const stats = [];
  for (const batch of chunks(campaigns.map(campaign => campaign.id), FULLSTATS_BATCH)) {
    if (stats.length) await pause(ADVERT_PAUSE_MS);
    const query = `ids=${batch.join(",")}&beginDate=${period.from}&endDate=${period.to}`;
    stats.push(...((await request(`${ADVERT}/adv/v3/fullstats?${query}`, token)) || []));
  }
  return { campaigns: stats.map(stat => campaignRow(stat, meta.get(stat.advertId))), days: adDays(stats) };
}

async function catalog(token) {
  const cards = [];
  let cursor = { limit: 100 };
  for (;;) {
    const page = await request(`${CONTENT}/content/v2/get/cards/list`, token, {
      method: "POST",
      body: JSON.stringify({ settings: { cursor, filter: { withPhoto: -1 } } }),
    });
    cards.push(...(page?.cards || []));
    if (!page?.cards?.length || page.cards.length < cursor.limit) break;
    cursor = { limit: 100, updatedAt: page.cursor.updatedAt, nmID: page.cursor.nmID };
  }
  return cards.map(card => ({
    nmId: card.nmID, article: card.vendorCode, title: card.title, subject: card.subjectName,
    photo: card.photos?.[0]?.c246x328 || card.photos?.[0]?.tm || null,
    skus: (card.sizes || []).flatMap(size => size.skus || []),
  }));
}

async function fbsStocks(token, cards) {
  const warehouses = (await request(`${MARKETPLACE}/api/v3/warehouses`, token)) || [];
  const skuToCard = new Map(cards.flatMap(card => card.skus.map(sku => [sku, card])));
  const stocks = [];
  for (const warehouse of warehouses) {
    for (const skus of chunks([...skuToCard.keys()], STOCKS_BATCH)) {
      const reply = await request(`${MARKETPLACE}/api/v3/stocks/${warehouse.id}`, token, { method: "POST", body: JSON.stringify({ skus }) });
      for (const stock of reply?.stocks || []) {
        const card = skuToCard.get(stock.sku);
        stocks.push({ warehouse: warehouse.name, nmId: card?.nmId, article: card?.article, sku: stock.sku, amount: Number(stock.amount) || 0 });
      }
    }
  }
  return stocks;
}

async function section(name, errors, load, fallback) {
  try {
    return await load();
  } catch (error) {
    errors.push({ section: name, message: String(error.message || error).slice(0, 300) });
    return fallback;
  }
}

export async function collect(token, now = new Date()) {
  const period = periodBounds(now);
  const errors = [];
  const orders = await section("Заказы", errors, () => statisticsRows("/api/v1/supplier/orders", token, period), []);
  const sales = await section("Продажи", errors, () => statisticsRows("/api/v1/supplier/sales", token, period), []);
  const ads = await section("Реклама", errors, () => advertising(token, period), { campaigns: [], days: [] });
  const cards = await section("Карточки", errors, () => catalog(token), []);
  const stocks = cards.length ? await section("Остатки FBS", errors, () => fbsStocks(token, cards), []) : [];
  const photos = Object.fromEntries(cards.map(card => [card.nmId, { photo: card.photo, title: card.title }]));
  return {
    generatedAt: now.toISOString(),
    period,
    days: dailyTotals(orders, sales, period),
    products: productTotals(orders, sales).map(product => ({ ...product, ...photos[product.nmId] })),
    regions: regionTotals(orders),
    ads,
    stocks,
    errors,
  };
}
