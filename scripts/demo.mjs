const DAY_MS = 86400000;
const PERIOD_DAYS = 30;
const PRODUCTS = [
  { nmId: 1903632268, article: "SHL-10", subject: "Травяные сборы", brand: "Shuang Huang Lian", title: "Шуан Хуан Лянь эликсир 10 флаконов", price: 729 },
  { nmId: 1903640001, article: "JNS-M-32", subject: "Джинсы", brand: "PlusDelivery", title: "Джинсы мужские прямые", price: 1890 },
  { nmId: 1903640002, article: "UND-M-5", subject: "Трусы", brand: "PlusDelivery", title: "Трусы мужские набор 5 шт", price: 990 },
];

const isoDate = time => new Date(time).toISOString().slice(0, 10);
const wave = (index, base) => Math.max(0, Math.round(base + base * 0.6 * Math.sin(index / 3)));

export function demoData(now = new Date()) {
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: PERIOD_DAYS }, (_, index) => {
    const ordersCount = wave(index, 6);
    const salesCount = Math.round(ordersCount * 0.7);
    return { date: isoDate(to - (PERIOD_DAYS - 1 - index) * DAY_MS), ordersCount, ordersSum: ordersCount * 1100, cancelCount: index % 5 ? 0 : 1, salesCount, salesSum: salesCount * 1100, returnsCount: index % 7 ? 0 : 1 };
  });
  const products = PRODUCTS.map((product, index) => {
    const orders = 60 - index * 18;
    const sales = Math.round(orders * (0.75 - index * 0.1));
    return { ...product, orders, ordersSum: orders * product.price, sales, salesSum: sales * product.price, returns: index, photo: null };
  });
  const adDays = days.map(day => ({ date: day.date, views: day.ordersCount * 40, clicks: day.ordersCount * 5, spent: day.ordersCount * 2.7, orders: Math.round(day.ordersCount / 3) }));
  return {
    generatedAt: new Date(now).toISOString(),
    period: { from: days[0].date, to: days.at(-1).date },
    demo: true,
    days,
    products,
    regions: [{ name: "Москва", count: 52 }, { name: "Московская область", count: 31 }, { name: "Санкт-Петербург", count: 18 }, { name: "Краснодарский край", count: 9 }],
    ads: {
      campaigns: [
        { id: 41020586, status: 9, type: 9, views: 4200, clicks: 520, ctr: 12.4, cpc: 0.62, spent: 322, carts: 140, orders: 41, ordersSum: 2240, drr: 14.4 },
        { id: 41020999, status: 11, type: 8, views: 1800, clicks: 95, ctr: 5.3, cpc: 0.71, spent: 67, carts: 21, orders: 6, ordersSum: 330, drr: 20.3 },
      ],
      days: adDays,
    },
    stocks: [
      { warehouse: "Гуанчжоу FBS", nmId: 1903632268, article: "SHL-10", sku: "2045000000011", amount: 50 },
      { warehouse: "Гуанчжоу FBS", nmId: 1903640001, article: "JNS-M-32", sku: "2045000000028", amount: 6 },
      { warehouse: "Гуанчжоу FBS", nmId: 1903640002, article: "UND-M-5", sku: "2045000000035", amount: 0 },
    ],
    errors: [],
  };
}
