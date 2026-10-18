const DAY_MS = 86400000;
const HISTORY_DAYS = 60;
const PERIOD_DAYS = 30;
const WEEKDAY_WEIGHT = [1.25, 1.05, 0.95, 0.9, 0.85, 1.0, 1.2];
const PRODUCTS = [
  { nmId: 1903632268, article: "SHL-10", subject: "Травяные сборы", brand: "Shuang Huang Lian", title: "Шуан Хуан Лянь эликсир 10 флаконов", price: 729, share: 0.38, buyout: 0.82 },
  { nmId: 1903640001, article: "JNS-M-32", subject: "Джинсы", brand: "PlusDelivery", title: "Джинсы мужские прямые", price: 1890, share: 0.22, buyout: 0.58 },
  { nmId: 1903640002, article: "UND-M-5", subject: "Трусы", brand: "PlusDelivery", title: "Трусы мужские набор 5 шт", price: 990, share: 0.2, buyout: 0.9 },
  { nmId: 1903640003, article: "SCK-12", subject: "Носки", brand: "PlusDelivery", title: "Носки хлопок 12 пар", price: 690, share: 0.14, buyout: 0.93 },
  { nmId: 1903640004, article: "LS-W-01", subject: "Лонгсливы", brand: "PlusDelivery", title: "Лонгслив женский базовый", price: 1290, share: 0.06, buyout: 0.64 },
];
const REGIONS = [
  ["Москва", 74], ["Московская область", 41], ["Санкт-Петербург", 29], ["Краснодарский край", 17], ["Свердловская область", 13],
  ["Республика Татарстан", 11], ["Новосибирская область", 9], ["Нижегородская область", 7], ["Ростовская область", 6], ["Самарская область", 5],
];
const STOCK = [64, 9, 0, 140, 22];

const isoDate = time => new Date(time).toISOString().slice(0, 10);
const noise = index => 0.85 + 0.3 * Math.abs(Math.sin(index * 12.9898) * 43758.5453 % 1);

function demoDays(to) {
  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const time = to - (HISTORY_DAYS - 1 - index) * DAY_MS;
    const trend = 0.55 + (index / HISTORY_DAYS) * 0.75;
    const ordersCount = Math.round(9 * trend * WEEKDAY_WEIGHT[new Date(time).getUTCDay()] * noise(index));
    const averageCheck = 1020 + 140 * Math.sin(index / 4);
    const salesCount = Math.round(ordersCount * 0.74);
    return {
      date: isoDate(time), ordersCount, ordersSum: Math.round(ordersCount * averageCheck),
      cancelCount: index % 6 ? 0 : 1, salesCount, salesSum: Math.round(salesCount * averageCheck), returnsCount: index % 8 ? 0 : 1,
    };
  });
}

function demoProducts(totalOrders) {
  return PRODUCTS.map(({ share, buyout, ...product }) => {
    const orders = Math.round(totalOrders * share);
    const sales = Math.round(orders * buyout);
    return { ...product, orders, ordersSum: orders * product.price, sales, salesSum: sales * product.price, returns: Math.round(orders * (1 - buyout) * 0.3), photo: null };
  });
}

export function demoData(now = new Date()) {
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = demoDays(to);
  const recent = days.slice(-PERIOD_DAYS);
  const totalOrders = recent.reduce((total, day) => total + day.ordersCount, 0);
  const adDays = recent.map((day, index) => {
    const views = Math.round(day.ordersCount * 55 * noise(index + 3));
    const clicks = Math.round(views * (0.09 + 0.03 * Math.sin(index / 5)));
    return { date: day.date, views, clicks, spent: Math.round(clicks * 0.64 * 100) / 100, orders: Math.round(day.ordersCount * 0.35) };
  });
  return {
    generatedAt: new Date(now).toISOString(),
    period: { from: recent[0].date, to: recent.at(-1).date },
    demo: true,
    days,
    products: demoProducts(totalOrders),
    regions: REGIONS.map(([name, count]) => ({ name, count })),
    ads: {
      campaigns: [
        { id: 41020586, status: 9, type: 9, views: 9800, clicks: 1180, ctr: 12, cpc: 0.62, spent: 731, carts: 310, orders: 74, ordersSum: 54020, drr: 9.4 },
        { id: 41020999, status: 11, type: 8, views: 3100, clicks: 160, ctr: 5.2, cpc: 0.78, spent: 125, carts: 31, orders: 7, ordersSum: 9030, drr: 9.7 },
      ],
      days: adDays,
    },
    stocks: PRODUCTS.map((product, index) => ({ warehouse: "Гуанчжоу FBS", nmId: product.nmId, article: product.article, sku: `20450000000${index + 1}`, amount: STOCK[index] })),
    errors: [],
  };
}
