const RECENT_DAYS = 7;
const LOW_STOCK_DAYS = 7;
const IDLE_AD_DAYS = 2;
const DAY_MS = 86400000;

const isoDate = time => new Date(time).toISOString().slice(0, 10);
const round = value => Math.round(value * 10) / 10;

function stockByProduct(stocks) {
  const totals = new Map();
  for (const stock of stocks) totals.set(stock.nmId, (totals.get(stock.nmId) || 0) + stock.amount);
  return totals;
}

function productLine(product, perDay, stock, yesterday) {
  const week = Object.values(perDay).reduce((sum, count) => sum + count, 0);
  const dailyRate = week / RECENT_DAYS;
  return {
    nmId: product.nmId,
    article: product.article,
    title: product.title || product.subject,
    ordersYesterday: perDay[yesterday] || 0,
    ordersWeek: week,
    stock,
    stockDays: stock === null || !dailyRate ? null : round(stock / dailyRate),
  };
}

function stockAlerts(lines) {
  return lines
    .filter(line => line.stock !== null && (line.stock === 0 ? line.ordersWeek > 0 : line.stockDays !== null && line.stockDays < LOW_STOCK_DAYS))
    .map(line => ({ kind: "остаток", text: `${line.article}: осталось ${line.stock} шт, это ${line.stockDays ?? 0} дн. продаж` }));
}

function adAlerts(adDays, today) {
  const recent = adDays.filter(day => day.date < today).slice(-IDLE_AD_DAYS);
  const spent = recent.reduce((sum, day) => sum + day.spent, 0);
  const orders = recent.reduce((sum, day) => sum + day.orders, 0);
  if (recent.length < IDLE_AD_DAYS || !spent || orders) return [];
  return [{ kind: "реклама", text: `за ${IDLE_AD_DAYS} дня реклама потратила ${round(spent)} без заказов` }];
}

function errorAlerts(errors) {
  return errors.map(error => ({ kind: "нет данных", text: `${error.section}: ${error.message.slice(0, 120)}` }));
}

export function summarize(data, now = new Date()) {
  const today = isoDate(now);
  const yesterday = isoDate(now.getTime() - DAY_MS);
  const stocks = stockByProduct(data.stocks);
  const hasStocks = data.stocks.length > 0;
  const lines = data.products.map(product =>
    productLine(product, data.recentOrders?.[product.nmId] || {}, hasStocks ? stocks.get(product.nmId) ?? 0 : null, yesterday));
  const adWeek = data.ads.days.slice(-RECENT_DAYS);
  return {
    generatedAt: data.generatedAt,
    products: lines,
    ads: {
      spentWeek: round(adWeek.reduce((sum, day) => sum + day.spent, 0)),
      ordersWeek: adWeek.reduce((sum, day) => sum + day.orders, 0),
      clicksWeek: adWeek.reduce((sum, day) => sum + day.clicks, 0),
    },
    alerts: [...stockAlerts(lines), ...adAlerts(data.ads.days, today), ...errorAlerts(data.errors)],
  };
}
