(() => {
  const AD_CURRENCY = "¥";
  const CNY_TO_RUB = 11.5;
  const PRODUCT_DAYS = 30;
  const LEAD_TIME_DAYS = 14;
  const LOW_STOCK_DAYS = 7;
  const DAYS_BAR_MAX = 60;
  const DRR_TARGET = 15;
  const CTR_LOW = 3;
  const BUYOUT_LOW = 60;
  const BUYOUT_WARN = 75;
  const TREND_THRESHOLD = 10;
  const FORECAST_BASE_DAYS = 7;
  const ABC_A = 0.8;
  const ABC_B = 0.95;
  const COUNT_UP_MS = 900;
  const FAIL_DELAY_MS = 1500;
  const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const WEEKDAYS_FULL = ["понедельник", "вторник", "среду", "четверг", "пятницу", "субботу", "воскресенье"];
  const RANGE_LABELS = { 7: "7 дней", 14: "14 дней", 30: "30 дней" };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = { data: null, sealed: null, range: 30, selected: null, failures: 0, sort: { key: "ordersSum", asc: false } };
  const $ = id => document.getElementById(id);

  const rub = value => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
  const cny = value => `${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${AD_CURRENCY}`;
  const count = value => Math.round(value).toLocaleString("ru-RU");
  const pct = value => (value === null || !isFinite(value) ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`);
  const ratio = (part, whole) => (whole ? (part / whole) * 100 : null);
  const shortDate = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const longDate = time => new Date(time).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const weekdayIndex = iso => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const escapeHtml = text => String(text ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const safeImage = url => (/^https:\/\/[a-z0-9.-]+\.(wbbasket|wb)\.ru\//i.test(url || "") ? url : null);
  const icon = name => `<svg class="ic"><use href="#i-${name}"/></svg>`;

  const currentDays = () => state.data.days.slice(-state.range);
  const previousDays = () => {
    const days = state.data.days;
    return days.length >= state.range * 2 ? days.slice(-state.range * 2, -state.range) : [];
  };
  const rangeAdDays = () => state.data.ads.days.filter(day => day.date >= currentDays()[0].date);

  function change(current, previous) {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
  }

  function chip(delta, goodWhenUp = true) {
    if (delta === null || !isFinite(delta)) return "";
    if (Math.abs(delta) < 0.5) return `<span class="chip flat">без изменений</span>`;
    const good = delta > 0 === goodWhenUp;
    return `<span class="chip ${good ? "up" : "down"}">${icon(delta > 0 ? "up" : "down")}${pct(Math.abs(delta))}</span>`;
  }

  function animateNumber(element, target, format) {
    if (reduceMotion) { element.textContent = format(target); return; }
    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      element.textContent = format(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function totals(days) {
    const orders = sum(days, "ordersCount");
    const ordersSum = sum(days, "ordersSum");
    return {
      orders, ordersSum,
      sales: sum(days, "salesCount"), salesSum: sum(days, "salesSum"),
      losses: sum(days, "cancelCount") + sum(days, "returnsCount"),
      averageCheck: orders ? ordersSum / orders : 0,
    };
  }

  function renderHero() {
    const now = totals(currentDays());
    const before = previousDays().length ? totals(previousDays()) : null;
    $("rangeLabel").textContent = RANGE_LABELS[state.range];
    animateNumber($("heroOrders"), now.ordersSum, value => Math.round(value).toLocaleString("ru-RU"));
    const delta = before ? change(now.ordersSum, before.ordersSum) : null;
    $("heroDelta").innerHTML = delta === null ? "" : `${chip(delta)}<span class="chip-note">к прошлым ${RANGE_LABELS[state.range]}</span>`;
    $("heroSpark").innerHTML = Charts.spark(currentDays().map(day => day.ordersSum));
    Charts.prepareLines($("heroSpark"));
    renderForecast();
  }

  function renderForecast() {
    const recent = state.data.days.slice(-FORECAST_BASE_DAYS);
    const perDay = sum(recent, "ordersSum") / recent.length;
    const forecast = perDay * PRODUCT_DAYS;
    const lastMonth = sum(state.data.days.slice(-PRODUCT_DAYS), "ordersSum");
    const delta = change(forecast, lastMonth);
    const fill = Math.min(1, lastMonth ? forecast / (lastMonth * 1.5) : 0);
    $("forecast").innerHTML = `<h3>Прогноз заказов на 30 дней</h3>
      <div><div class="fc-value">${rub(forecast)}</div><div class="fc-sub">по темпу последних 7 дней: ${rub(perDay)} в день</div></div>
      <div class="meter"><i style="transform:scaleX(0)"></i></div>
      <div class="fc-sub">${delta === null ? "" : `${chip(delta)} <span class="chip-note">к последним 30 дням</span>`}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => { $("forecast").querySelector(".meter i").style.transform = `scaleX(${fill})`; }));
  }

  function kpiCard({ label, value, numeric, format, sub, delta, goodWhenUp, accent }, index) {
    return `<div class="kpi" style="--ac:${accent};--i:${index}"><div class="kpi-lab">${label}</div><div class="kpi-val" data-target="${numeric ?? ""}" data-format="${format || ""}">${value}</div><div class="kpi-sub">${chip(delta, goodWhenUp)}<span>${sub}</span></div></div>`;
  }

  const FORMATS = { rub, count, pct, cny };

  function renderKpiGroup(element, cards) {
    element.innerHTML = cards.map(kpiCard).join("");
    element.classList.remove("stagger");
    void element.offsetWidth;
    element.classList.add("stagger");
    element.querySelectorAll(".kpi-val[data-target]").forEach(node => {
      if (node.dataset.target === "") return;
      animateNumber(node, Number(node.dataset.target), FORMATS[node.dataset.format]);
    });
  }

  function renderKpi() {
    const now = totals(currentDays());
    const before = previousDays().length ? totals(previousDays()) : null;
    const delta = field => (before ? change(now[field], before[field]) : null);
    const buyout = ratio(now.sales, now.orders);
    const buyoutBefore = before ? ratio(before.sales, before.orders) : null;
    const adSpent = sum(rangeAdDays(), "spent");
    renderKpiGroup($("kpi"), [
      { label: "Заказы", value: count(now.orders), numeric: now.orders, format: "count", sub: "шт", delta: delta("orders"), accent: "var(--amber)" },
      { label: "Выкупы", value: rub(now.salesSum), numeric: now.salesSum, format: "rub", sub: `${count(now.sales)} шт`, delta: delta("salesSum"), accent: "var(--mint)" },
      { label: "Процент выкупа", value: pct(buyout), numeric: buyout, format: "pct", sub: "выкупы к заказам", delta: buyoutBefore === null || buyout === null ? null : buyout - buyoutBefore, accent: "var(--mint)" },
      { label: "Средний чек", value: rub(now.averageCheck), numeric: now.averageCheck, format: "rub", sub: "на заказ", delta: delta("averageCheck"), accent: "var(--sky)" },
      { label: "Отмены и возвраты", value: count(now.losses), numeric: now.losses, format: "count", sub: `${pct(ratio(now.losses, now.orders))} заказов`, delta: delta("losses"), goodWhenUp: false, accent: "var(--coral)" },
      { label: "Реклама", value: cny(adSpent), numeric: adSpent, format: "cny", sub: `≈ ${rub(adSpent * CNY_TO_RUB)}`, accent: "var(--sky)" },
    ]);
  }

  function renderChart() {
    const days = currentDays();
    if (!days.some(day => day.date === state.selected)) state.selected = days.at(-1).date;
    $("dayChart").innerHTML = Charts.days(days, state.selected, shortDate);
    Charts.prepareLines($("dayChart"));
    renderReadout(days.find(day => day.date === state.selected));
  }

  function renderReadout(day) {
    const buyout = ratio(day.salesCount, day.ordersCount);
    $("dayReadout").innerHTML = [["День", `${shortDate(day.date)}, ${WEEKDAYS[weekdayIndex(day.date)]}`], ["Заказы", `${day.ordersCount} · ${rub(day.ordersSum)}`], ["Выкупы", `${day.salesCount} · ${rub(day.salesSum)}`], ["Выкуп", pct(buyout)], ["Отмены / возвраты", `${day.cancelCount} / ${day.returnsCount}`]]
      .map(([label, value]) => `<div class="rd"><s>${label}</s><b>${value}</b></div>`).join("");
  }

  function selectDay(index, clientX) {
    const days = currentDays();
    const day = days[index];
    if (!day) return;
    state.selected = day.date;
    const svg = $("dayChart").querySelector("svg");
    svg.querySelectorAll(".bar").forEach(bar => bar.classList.toggle("on", Number(bar.dataset.index) === index));
    renderReadout(day);
    const tip = $("chartTip");
    tip.hidden = clientX === undefined;
    if (tip.hidden) return;
    tip.innerHTML = `<b>${shortDate(day.date)}, ${WEEKDAYS[weekdayIndex(day.date)]}</b><div>Заказы <span>${rub(day.ordersSum)}</span></div><div>Выкупы <span>${rub(day.salesSum)}</span></div><div>Шт <span>${day.ordersCount} / ${day.salesCount}</span></div>`;
    tip.style.left = `${Charts.dayAnchor(svg, index, days.length)}px`;
    tip.style.top = "6px";
  }

  function onChartPointer(event) {
    const svg = $("dayChart").querySelector("svg");
    if (!svg) return;
    selectDay(Charts.dayIndexAt(svg, event.clientX, currentDays().length), event.clientX);
  }

  function renderWeekdays() {
    const buckets = WEEKDAYS.map(() => ({ orders: 0, days: 0 }));
    for (const day of state.data.days) {
      const bucket = buckets[weekdayIndex(day.date)];
      bucket.orders += day.ordersCount;
      bucket.days += 1;
    }
    const averages = buckets.map(bucket => (bucket.days ? bucket.orders / bucket.days : 0));
    const best = Math.max(...averages);
    $("weekdays").innerHTML = averages.map((average, index) => `<div class="wd${average === best && best > 0 ? " best" : ""}">
      <span class="wd-val">${average.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}</span>
      <div class="wd-col" style="height:${best ? Math.max(6, (average / best) * 100) : 6}%;transition-delay:${index * 60}ms"></div>
      <span class="wd-name">${WEEKDAYS[index]}</span></div>`).join("");
    return averages;
  }

  function renderRegions() {
    const regions = state.data.regions;
    if (!regions.length) { $("regions").innerHTML = `<div class="empty">Заказов за период пока нет</div>`; return; }
    const top = regions[0].count;
    const total = sum(regions, "count");
    $("regions").innerHTML = regions.map((region, index) => `<div class="rrow"><div class="rname" title="${escapeHtml(region.name)}">${escapeHtml(region.name)}</div><div class="rbar"><i style="--w:${region.count / top};transition-delay:${index * 50}ms"></i></div><div class="rval">${count(region.count)}<s>${pct(ratio(region.count, total))}</s></div></div>`).join("");
  }

  function stockByProduct() {
    const stock = new Map();
    for (const row of state.data.stocks) stock.set(row.nmId, (stock.get(row.nmId) || 0) + row.amount);
    return stock;
  }

  function productRows() {
    const stock = stockByProduct();
    const total = sum(state.data.products, "ordersSum");
    let cumulative = 0;
    return [...state.data.products].sort((a, b) => b.ordersSum - a.ordersSum).map(product => {
      cumulative += product.ordersSum;
      const share = total ? cumulative / total : 1;
      const perDay = product.orders / PRODUCT_DAYS;
      const amount = stock.has(product.nmId) ? stock.get(product.nmId) : null;
      return {
        ...product,
        abc: share <= ABC_A || cumulative === product.ordersSum ? "A" : share <= ABC_B ? "B" : "C",
        share: ratio(product.ordersSum, total) || 0,
        buyout: ratio(product.sales, product.orders),
        stock: amount,
        daysLeft: amount !== null && perDay ? amount / perDay : null,
      };
    });
  }

  function buyoutPill(value) {
    if (value === null) return `<span class="pill p-mute">—</span>`;
    const tone = value < BUYOUT_LOW ? "p-bad" : value < BUYOUT_WARN ? "p-warn" : "p-ok";
    return `<span class="pill ${tone}">${pct(value)}</span>`;
  }

  function daysPill(amount, daysLeft) {
    if (amount === null) return `<span class="pill p-mute">—</span>`;
    if (amount === 0) return `<span class="pill p-bad">нет</span>`;
    if (daysLeft === null) return `<span class="pill p-mute">${count(amount)} шт</span>`;
    const tone = daysLeft < LOW_STOCK_DAYS ? "p-bad" : daysLeft < LEAD_TIME_DAYS ? "p-warn" : "p-ok";
    return `<span class="pill ${tone}">${count(amount)} шт · ${Math.floor(daysLeft)} дн</span>`;
  }

  const PRODUCT_COLUMNS = [
    { key: null, title: "" },
    { key: "title", title: "Товар" },
    { key: "abc", title: "ABC" },
    { key: "orders", title: "Заказы", right: true },
    { key: "ordersSum", title: "Сумма", right: true },
    { key: "share", title: "Доля", right: true },
    { key: "buyout", title: "Выкуп", right: true },
    { key: "stock", title: "Остаток", right: true },
  ];

  function sortedProducts() {
    const { key, asc } = state.sort;
    const value = row => (key === "title" ? String(row.title || row.article) : row[key] ?? -1);
    return productRows().sort((a, b) => {
      const order = typeof value(a) === "string" ? value(a).localeCompare(value(b), "ru") : value(a) - value(b);
      return asc ? order : -order;
    });
  }

  function productRow(product) {
    const image = safeImage(product.photo);
    return `<tr>
      <td>${image ? `<img class="thumb" src="${escapeHtml(image)}" alt="" loading="lazy">` : `<div class="thumb">${icon("box")}</div>`}</td>
      <td><div class="pname">${escapeHtml(product.title || product.subject)}</div><div class="psub">${escapeHtml(product.article)} · ${escapeHtml(product.nmId)}</div></td>
      <td><span class="abc abc-${product.abc}">${product.abc}</span></td>
      <td class="r">${count(product.orders)}<div class="psub">выкуп ${count(product.sales)}</div></td>
      <td class="r">${rub(product.ordersSum)}</td>
      <td class="r"><div class="share">${pct(product.share)}<i><b style="width:${product.share}%"></b></i></div></td>
      <td class="r">${buyoutPill(product.buyout)}</td>
      <td class="r">${daysPill(product.stock, product.daysLeft)}</td>
    </tr>`;
  }

  function renderProducts() {
    if (!state.data.products.length) { $("productsTable").innerHTML = `<tr><td class="empty">Заказов за период пока нет</td></tr>`; return; }
    const head = PRODUCT_COLUMNS.map(column => {
      const sorted = column.key === state.sort.key ? ` sorted${state.sort.asc ? " asc" : ""}` : "";
      return `<th class="${column.right ? "r" : ""}${sorted}"${column.key ? ` data-sort="${column.key}" tabindex="0" aria-sort="${sorted ? (state.sort.asc ? "ascending" : "descending") : "none"}"` : ""}>${column.title}</th>`;
    }).join("");
    $("productsTable").innerHTML = `<thead><tr>${head}</tr></thead><tbody class="stagger">${sortedProducts().map(productRow).join("")}</tbody>`;
    $("productsTable").querySelectorAll("tbody tr").forEach((row, index) => row.style.setProperty("--i", index));
  }

  function onSort(event) {
    const header = event.target.closest("th[data-sort]");
    if (!header || (event.type === "keydown" && event.key !== "Enter")) return;
    const key = header.dataset.sort;
    state.sort = { key, asc: state.sort.key === key ? !state.sort.asc : key === "title" };
    renderProducts();
  }

  function exportCsv() {
    const header = ["Артикул", "nmId", "Товар", "ABC", "Заказы, шт", "Заказы, руб", "Выкупы, шт", "Выкупы, руб", "Выкуп, %", "Остаток", "Хватит, дн"];
    const lines = productRows().map(row => [row.article, row.nmId, row.title || row.subject, row.abc, row.orders, Math.round(row.ordersSum), row.sales, Math.round(row.salesSum), row.buyout === null ? "" : row.buyout.toFixed(1), row.stock ?? "", row.daysLeft === null ? "" : Math.floor(row.daysLeft)]);
    const csv = [header, ...lines].map(line => line.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `wb-товары-${state.data.period.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function adTotals() {
    const campaigns = state.data.ads.campaigns;
    const spent = sum(campaigns, "spent");
    return {
      views: sum(campaigns, "views"), clicks: sum(campaigns, "clicks"), carts: sum(campaigns, "carts"),
      orders: sum(campaigns, "orders"), spent, ordersSum: sum(campaigns, "ordersSum"),
      drr: ratio(spent, sum(campaigns, "ordersSum")),
    };
  }

  function renderAdsKpi() {
    const days = rangeAdDays();
    const spent = sum(days, "spent");
    const clicks = sum(days, "clicks");
    const views = sum(days, "views");
    const orders = sum(days, "orders");
    const total = adTotals();
    renderKpiGroup($("adsKpi"), [
      { label: "Расход", value: cny(spent), numeric: spent, format: "cny", sub: `≈ ${rub(spent * CNY_TO_RUB)}`, accent: "var(--sky)" },
      { label: "CTR", value: pct(ratio(clicks, views)), numeric: ratio(clicks, views), format: "pct", sub: `${count(clicks)} кликов из ${count(views)}`, accent: "var(--sky)" },
      { label: "Цена заказа", value: orders ? cny(spent / orders) : "—", numeric: orders ? spent / orders : null, format: "cny", sub: `клик ${clicks ? cny(spent / clicks) : "—"}, заказов ${count(orders)}`, accent: "var(--amber)" },
      { label: "ДРР за 30 дней", value: pct(total.drr), numeric: total.drr, format: "pct", sub: `цель до ${DRR_TARGET}%`, accent: total.drr !== null && total.drr > DRR_TARGET ? "var(--coral)" : "var(--mint)" },
    ]);
  }

  function renderFunnel() {
    const total = adTotals();
    const steps = [["Показы", total.views, "var(--sky)"], ["Клики", total.clicks, "#a9c8ff"], ["Корзины", total.carts, "var(--mint)"], ["Заказы", total.orders, "var(--amber)"]];
    if (!total.views) { $("funnel").innerHTML = `<div class="empty">Нет данных по рекламе</div>`; return; }
    $("funnel").innerHTML = steps.map(([label, value, color], index) => {
      const width = Math.max(8, Math.sqrt(value / total.views) * 100);
      const conversion = index ? pct(ratio(value, steps[index - 1][1])) : "100%";
      return `<div class="fstep"><s>${label}</s><div class="fbar"><i style="width:${width}%;background:${color};transition-delay:${index * 120}ms">${count(value)}</i></div><div class="fconv">${conversion}</div></div>`;
    }).join("");
  }

  function campaignStatus(status) {
    if (status === 9) return `<span class="pill p-ok">идет</span>`;
    if (status === 11) return `<span class="pill p-warn">пауза</span>`;
    return `<span class="pill p-mute">завершена</span>`;
  }

  function renderAdsTable() {
    const campaigns = state.data.ads.campaigns;
    if (!campaigns.length) { $("adsTable").innerHTML = `<tr><td class="empty">Активных кампаний нет или нет доступа к рекламе</td></tr>`; return; }
    const rows = campaigns.map((campaign, index) => {
      const drr = ratio(campaign.spent, campaign.ordersSum);
      const drrTone = drr === null ? "p-mute" : drr > DRR_TARGET ? "p-bad" : "p-ok";
      return `<tr style="--i:${index}">
        <td><div class="pname">Кампания ${escapeHtml(campaign.id)}</div><div class="psub">${campaignStatus(campaign.status)}</div></td>
        <td class="r">${count(campaign.views)}</td><td class="r">${count(campaign.clicks)}</td><td class="r">${pct(campaign.ctr)}</td>
        <td class="r">${cny(campaign.cpc)}</td><td class="r">${cny(campaign.spent)}</td><td class="r">${count(campaign.carts)}</td>
        <td class="r">${count(campaign.orders)}</td><td class="r"><span class="pill ${drrTone}">${pct(drr)}</span></td>
      </tr>`;
    }).join("");
    $("adsTable").innerHTML = `<thead><tr><th>Кампания</th><th class="r">Показы</th><th class="r">Клики</th><th class="r">CTR</th><th class="r">Клик</th><th class="r">Расход</th><th class="r">Корзины</th><th class="r">Заказы</th><th class="r">ДРР</th></tr></thead><tbody class="stagger">${rows}</tbody>`;
  }

  function renderAds() {
    $("adsNote").textContent = `Расход в ${AD_CURRENCY}, как в кабинете WB Продвижение. В рублях - по курсу около ${CNY_TO_RUB} ₽. ДРР - доля расхода на рекламу в сумме заказов с нее, обе суммы в ${AD_CURRENCY}.`;
    renderAdsKpi();
    renderFunnel();
    $("adChart").innerHTML = Charts.ads(rangeAdDays(), shortDate) || `<div class="empty">Нет данных по рекламе</div>`;
    Charts.prepareLines($("adChart"));
    renderAdsTable();
  }

  function reorderText(row) {
    if (row.stock === 0) return `<b>Закончился</b> - товар не показывается покупателям`;
    if (row.daysLeft === null) return "Заказов за 30 дней не было";
    const orderBy = Date.now() + (row.daysLeft - LEAD_TIME_DAYS) * 86400000;
    if (row.daysLeft <= LEAD_TIME_DAYS) return `<b>Дозаказать сейчас</b> - закончится раньше, чем приедет новая партия`;
    return `Дозаказать до <b>${longDate(orderBy)}</b>`;
  }

  function stockCard(row, index) {
    const tone = row.stock === 0 || (row.daysLeft !== null && row.daysLeft < LOW_STOCK_DAYS) ? "var(--coral)" : row.daysLeft !== null && row.daysLeft <= LEAD_TIME_DAYS ? "var(--amber)" : "var(--mint)";
    const width = row.daysLeft === null ? 1 : Math.min(1, row.daysLeft / DAYS_BAR_MAX);
    return `<div class="stock reveal${row.stock === 0 ? " bad" : ""}" style="transition-delay:${index * 70}ms">
      <div class="stock-top"><div><div class="pname">${escapeHtml(row.title || row.article)}</div><div class="psub">${escapeHtml(row.article)}</div></div>${daysPill(row.stock, row.daysLeft)}</div>
      <div class="stock-amount">${count(row.stock)}<small>шт на складе</small></div>
      <div class="daysbar"><i style="--w:${width};background:${tone}"></i></div>
      <div class="stock-foot">${reorderText(row)}</div></div>`;
  }

  function stockRows() {
    const known = new Map(productRows().map(row => [row.nmId, row]));
    const stockOnly = [...stockByProduct()].filter(([nmId]) => !known.has(nmId)).map(([nmId, amount]) => {
      const sample = state.data.stocks.find(row => row.nmId === nmId) || {};
      return { nmId, article: sample.article || sample.sku, title: sample.article || sample.sku, stock: amount, daysLeft: null, orders: 0 };
    });
    return [...known.values()].filter(row => row.stock !== null).concat(stockOnly);
  }

  function renderStocks() {
    const rows = stockRows().sort((a, b) => (a.stock === 0 ? -1 : 0) - (b.stock === 0 ? -1 : 0) || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
    $("stockNote").textContent = `Хватит - на сколько дней остатка при текущем темпе заказов. Доставка партии из Китая около ${LEAD_TIME_DAYS} дней, поэтому дозаказ считаю заранее.`;
    $("stocks").innerHTML = rows.length ? rows.map(stockCard).join("") : `<div class="panel empty">Нет данных по остаткам</div>`;
    observeReveal($("stocks"));
  }

  function trendInsight(list) {
    const before = previousDays();
    if (!before.length) return;
    const delta = change(sum(currentDays(), "ordersSum"), sum(before, "ordersSum"));
    if (delta === null || Math.abs(delta) < TREND_THRESHOLD) return;
    if (delta > 0) list.push(["good", "up", "Заказы растут", `За ${RANGE_LABELS[state.range]} заказали на ${pct(delta)} больше, чем за прошлые ${RANGE_LABELS[state.range]}. Самое время держать остатки и рекламу.`]);
    else list.push(["bad", "down", "Заказы падают", `За ${RANGE_LABELS[state.range]} заказов на ${pct(-delta)} меньше, чем раньше. Проверьте цены конкурентов, остатки и ставки в рекламе.`]);
  }

  function stockInsights(list) {
    const rows = stockRows();
    const empty = rows.filter(row => row.stock === 0);
    if (empty.length) list.push(["bad", "alert", "Товары закончились", `${empty.map(row => row.article).join(", ")} - нет на складе, WB их не показывает. Каждый день без остатка - потерянные заказы и позиции в поиске.`]);
    const soon = rows.filter(row => row.stock > 0 && row.daysLeft !== null && row.daysLeft <= LEAD_TIME_DAYS);
    if (soon.length) list.push(["warn", "box", "Пора дозаказать", `${soon.map(row => `${row.article} (${Math.floor(row.daysLeft)} дн)`).join(", ")} ${soon.length > 1 ? "закончатся" : "закончится"} раньше, чем доедет новая партия из Китая.`]);
  }

  function buyoutInsight(list, rows) {
    const weak = rows.filter(row => row.orders >= 5 && row.buyout !== null && row.buyout < BUYOUT_LOW);
    if (weak.length) list.push(["warn", "alert", "Низкий выкуп", `${weak.map(row => `${row.article} - ${pct(row.buyout)}`).join(", ")}. Обычно дело в размерах, фото или описании: покупатель ждет одно, а получает другое. Стоит перечитать отзывы и вопросы.`]);
  }

  function adInsights(list) {
    const total = adTotals();
    if (total.drr !== null && total.drr > DRR_TARGET) list.push(["warn", "bolt", "Реклама дорогая", `ДРР ${pct(total.drr)} при цели до ${DRR_TARGET}%. Стоит убрать запросы без заказов и снизить ставки там, где клики не превращаются в корзины.`]);
    else if (total.drr !== null) list.push(["good", "check", "Реклама окупается", `ДРР ${pct(total.drr)} - в пределах цели ${DRR_TARGET}%. Можно аккуратно поднять дневной бюджет на кампаниях с заказами.`]);
    const lowCtr = state.data.ads.campaigns.filter(campaign => campaign.views > 500 && campaign.ctr < CTR_LOW);
    if (lowCtr.length) list.push(["warn", "bolt", "Мало кликают", `У кампании ${lowCtr.map(campaign => campaign.id).join(", ")} CTR ниже ${CTR_LOW}%. Главное фото и цена не цепляют в выдаче - их стоит поменять первыми.`]);
  }

  function weekdayInsight(list, averages) {
    const best = averages.indexOf(Math.max(...averages));
    const worst = averages.indexOf(Math.min(...averages));
    if (averages[best] > 0 && averages[best] > averages[worst] * 1.2) list.push(["info", "bolt", "Лучший день недели", `Чаще всего заказывают в ${WEEKDAYS_FULL[best]}, реже всего - в ${WEEKDAYS_FULL[worst]}. Акции и повышение ставок лучше ставить на сильные дни.`]);
  }

  function concentrationInsight(list, rows) {
    if (rows.length > 1 && rows[0].share > 50) list.push(["info", "box", "Все держится на одном товаре", `${rows[0].title || rows[0].article} дает ${pct(rows[0].share)} выручки. Если он закончится или просядет, просядет весь магазин - стоит раскачивать второй товар.`]);
  }

  const TONES = { good: ["var(--mint)", "var(--mint-soft)"], bad: ["var(--coral)", "var(--coral-soft)"], warn: ["var(--amber)", "var(--amber-soft)"], info: ["var(--sky)", "var(--sky-soft)"] };

  function renderInsights(averages) {
    const rows = productRows();
    const list = [];
    trendInsight(list);
    stockInsights(list);
    adInsights(list);
    buyoutInsight(list, rows);
    concentrationInsight(list, rows);
    weekdayInsight(list, averages);
    if (!list.length) list.push(["info", "check", "Все спокойно", "Отчет заполнится выводами, когда накопятся заказы."]);
    $("insightList").innerHTML = list.map(([tone, iconName, title, text], index) => {
      const [accent, soft] = TONES[tone];
      return `<div class="insight reveal" style="--ac:${accent};--soft:${soft};transition-delay:${index * 70}ms"><div class="insight-ic">${icon(iconName)}</div><div><b>${escapeHtml(title)}</b><p>${escapeHtml(text)}</p></div></div>`;
    }).join("");
    observeReveal($("insightList"));
    $("dataErrors").innerHTML = state.data.errors.map(error => `<div>Нет данных "${escapeHtml(error.section)}": проверьте, что у токена есть доступ к этому разделу.</div>`).join("");
  }

  const revealObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("in");
      revealObserver.unobserve(entry.target);
    }
  }, { threshold: 0.12 }) : null;

  function observeReveal(root = document) {
    root.querySelectorAll(".reveal:not(.in)").forEach(node => (revealObserver ? revealObserver.observe(node) : node.classList.add("in")));
  }

  function renderRange() {
    renderHero();
    renderKpi();
    renderChart();
    renderAds();
    renderInsights(renderWeekdays());
  }

  function renderAll() {
    const updated = new Date(state.data.generatedAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    $("updated").textContent = state.data.demo ? "Демо-данные, настоящие появятся после подключения токена" : `Обновлено ${updated}`;
    $("footUpdated").textContent = `Последнее обновление: ${updated}`;
    $("periodText").textContent = `Товары и реклама за ${shortDate(state.data.period.from)} - ${shortDate(state.data.period.to)}`;
    renderRegions();
    renderProducts();
    renderStocks();
    renderRange();
    observeReveal();
    moveSegThumb();
  }

  function moveSegThumb() {
    const active = $("rangeToggle").querySelector("button.on");
    const thumb = $("rangeToggle").querySelector(".seg-thumb");
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  function onRange(event) {
    const button = event.target.closest("button[data-days]");
    if (!button) return;
    state.range = Number(button.dataset.days);
    $("rangeToggle").querySelectorAll("button").forEach(item => item.classList.toggle("on", item === button));
    moveSegThumb();
    renderRange();
  }

  function trackSections() {
    if (!("IntersectionObserver" in window)) return;
    const links = [...document.querySelectorAll(".nav a")];
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach(link => link.classList.toggle("on", link.getAttribute("href") === `#${entry.target.id}`));
      }
    }, { rootMargin: "-40% 0px -55% 0px" });
    links.forEach(link => { const section = document.querySelector(link.getAttribute("href")); if (section) observer.observe(section); });
  }

  function showApp(data) {
    state.data = data;
    $("gate").hidden = true;
    $("app").hidden = false;
    renderAll();
    trackSections();
  }

  async function onUnlock(event) {
    event.preventDefault();
    const button = $("unlock");
    const error = $("gateError");
    button.disabled = true;
    error.textContent = "";
    error.classList.remove("shake");
    try {
      state.sealed = state.sealed || await ReportVault.load();
      showApp(await ReportVault.unlock($("password").value, state.sealed));
    } catch (failure) {
      state.failures += 1;
      error.textContent = failure.message === "Данные еще не собраны" ? failure.message : "Неверный пароль";
      void error.offsetWidth;
      error.classList.add("shake");
      await new Promise(resolve => setTimeout(resolve, FAIL_DELAY_MS * state.failures));
    } finally {
      $("password").value = "";
      button.disabled = false;
    }
  }

  function lock() {
    ReportVault.forget();
    state.data = null;
    $("app").hidden = true;
    $("gate").hidden = false;
    $("password").focus();
  }

  async function start() {
    $("gateForm").addEventListener("submit", onUnlock);
    $("dayChart").addEventListener("pointermove", onChartPointer);
    $("dayChart").addEventListener("click", onChartPointer);
    $("dayChart").addEventListener("pointerleave", () => { $("chartTip").hidden = true; });
    $("rangeToggle").addEventListener("click", onRange);
    $("productsTable").addEventListener("click", onSort);
    $("productsTable").addEventListener("keydown", onSort);
    $("exportCsv").addEventListener("click", exportCsv);
    $("lock").addEventListener("click", lock);
    window.addEventListener("resize", () => { if (state.data) moveSegThumb(); });
    try {
      state.sealed = await ReportVault.load();
      const data = await ReportVault.unlockFromSession(state.sealed);
      if (data) showApp(data);
    } catch {
      ReportVault.forget();
    }
  }

  start();
})();
