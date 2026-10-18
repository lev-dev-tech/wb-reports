(() => {
  const AD_CURRENCY = "¥";
  const LOW_STOCK_DAYS = 7;
  const FAIL_DELAY_MS = 1500;
  const CHART = { width: 900, height: 260, pad: 34 };
  const state = { data: null, sealed: null, range: 30, selected: null, failures: 0 };
  const $ = id => document.getElementById(id);

  const rub = value => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
  const cny = value => `${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${AD_CURRENCY}`;
  const count = value => Math.round(value).toLocaleString("ru-RU");
  const pct = value => (value === null || !isFinite(value) ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`);
  const shortDate = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const escapeHtml = text => String(text ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const safeImage = url => (/^https:\/\/[a-z0-9.-]+\.(wbbasket|wb)\.ru\//i.test(url || "") ? url : null);

  const rangeDays = () => state.data.days.slice(-state.range);
  const rangeAdDays = () => state.data.ads.days.filter(day => day.date >= rangeDays()[0].date);

  function kpiCard(label, value, sub, accent) {
    return `<div class="card" style="--ac:${accent}"><div class="lab">${label}</div><div class="val">${value}</div><div class="sub">${sub}</div></div>`;
  }

  function renderKpi() {
    const days = rangeDays();
    const orders = sum(days, "ordersCount");
    const sales = sum(days, "salesCount");
    const buyout = orders ? (sales / orders) * 100 : null;
    const adSpent = sum(rangeAdDays(), "spent");
    $("heroKpi").innerHTML = [["Заказы", rub(sum(days, "ordersSum"))], ["Выкупы", rub(sum(days, "salesSum"))], ["Выкуп", pct(buyout)]]
      .map(([label, value]) => `<div><b>${value}</b><s>${label}</s></div>`).join("");
    $("kpi").innerHTML = [
      kpiCard("Заказы", count(orders), `${rub(sum(days, "ordersSum"))} за ${state.range} дн.`, "var(--blue)"),
      kpiCard("Выкупы", count(sales), rub(sum(days, "salesSum")), "var(--green)"),
      kpiCard("Отмены и возвраты", count(sum(days, "cancelCount") + sum(days, "returnsCount")), `отмен ${count(sum(days, "cancelCount"))}, возвратов ${count(sum(days, "returnsCount"))}`, "var(--orange)"),
      kpiCard("Реклама", cny(adSpent), `${count(sum(rangeAdDays(), "clicks"))} кликов`, "var(--purple)"),
    ].join("");
  }

  function chartSvg(days) {
    const maxValue = Math.max(1, ...days.map(day => Math.max(day.ordersSum, day.salesSum)));
    const innerWidth = CHART.width - CHART.pad * 2;
    const innerHeight = CHART.height - CHART.pad * 2;
    const step = innerWidth / days.length;
    const y = value => CHART.pad + innerHeight - (value / maxValue) * innerHeight;
    const bars = days.map((day, index) => {
      const height = (day.ordersSum / maxValue) * innerHeight;
      const on = day.date === state.selected ? " on" : "";
      return `<rect class="bar${on}" data-date="${day.date}" x="${CHART.pad + index * step + step * 0.15}" y="${CHART.pad + innerHeight - height}" width="${step * 0.7}" height="${Math.max(height, 1)}" rx="3"></rect>`;
    }).join("");
    const line = days.map((day, index) => `${CHART.pad + index * step + step / 2},${y(day.salesSum)}`).join(" ");
    const labelEvery = Math.ceil(days.length / 10);
    const labels = days.map((day, index) => (index % labelEvery ? "" : `<text class="axis" x="${CHART.pad + index * step + step / 2}" y="${CHART.height - 10}" text-anchor="middle">${shortDate(day.date)}</text>`)).join("");
    const grid = [0.25, 0.5, 0.75, 1].map(share => `<line class="gridline" x1="${CHART.pad}" x2="${CHART.width - CHART.pad}" y1="${y(maxValue * share)}" y2="${y(maxValue * share)}"></line><text class="axis" x="2" y="${y(maxValue * share) + 3}">${Math.round((maxValue * share) / 1000)}к</text>`).join("");
    return `<svg viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="Заказы и выкупы по дням">${grid}${bars}<polyline class="salesline" points="${line}"></polyline>${labels}</svg>`;
  }

  function renderReadout(days) {
    const day = days.find(item => item.date === state.selected) || days.at(-1);
    state.selected = day.date;
    $("dayReadout").innerHTML = [["День", shortDate(day.date)], ["Заказы", `${day.ordersCount} / ${rub(day.ordersSum)}`], ["Выкупы", `${day.salesCount} / ${rub(day.salesSum)}`], ["Отмены", day.cancelCount], ["Возвраты", day.returnsCount]]
      .map(([label, value]) => `<div class="rdstat"><s>${label}</s><b>${value}</b></div>`).join("");
  }

  function renderChart() {
    const days = rangeDays();
    renderReadout(days);
    $("dayChart").innerHTML = chartSvg(days);
  }

  function stockByProduct() {
    const stock = new Map();
    for (const row of state.data.stocks) stock.set(row.nmId, (stock.get(row.nmId) || 0) + row.amount);
    return stock;
  }

  function renderProducts() {
    const products = state.data.products;
    if (!products.length) { $("productsTable").innerHTML = `<tr><td class="empty">Заказов за период пока нет</td></tr>`; return; }
    const stock = stockByProduct();
    const rows = products.map(product => {
      const image = safeImage(product.photo);
      const buyout = product.orders ? (product.sales / product.orders) * 100 : null;
      return `<tr>
        <td>${image ? `<img class="thumb" src="${escapeHtml(image)}" alt="">` : `<div class="thumb"></div>`}</td>
        <td><div class="pname">${escapeHtml(product.title || product.subject)}</div><div class="psub">${escapeHtml(product.article)} · ${escapeHtml(product.nmId)}</div></td>
        <td class="r">${count(product.orders)}<div class="psub">${rub(product.ordersSum)}</div></td>
        <td class="r">${count(product.sales)}<div class="psub">${rub(product.salesSum)}</div></td>
        <td class="r">${pct(buyout)}</td>
        <td class="r">${stock.has(product.nmId) ? count(stock.get(product.nmId)) : "—"}</td>
      </tr>`;
    }).join("");
    $("productsTable").innerHTML = `<thead><tr><th></th><th>Товар</th><th class="r">Заказы</th><th class="r">Выкупы</th><th class="r">Выкуп</th><th class="r">Остаток</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function renderAds() {
    const campaigns = state.data.ads.campaigns;
    const days = rangeAdDays();
    const spent = sum(days, "spent");
    const clicks = sum(days, "clicks");
    const views = sum(days, "views");
    $("adsNote").textContent = `Расход и показатели в ${AD_CURRENCY}, как в кабинете WB Продвижение. Таблица кампаний за 30 дней.`;
    $("adsKpi").innerHTML = [
      kpiCard("Показы", count(views), `за ${state.range} дн.`, "var(--blue)"),
      kpiCard("Клики", count(clicks), `CTR ${pct(views ? (clicks / views) * 100 : null)}`, "var(--teal)"),
      kpiCard("Расход", cny(spent), `клик ${clicks ? cny(spent / clicks) : "—"}`, "var(--purple)"),
      kpiCard("Заказы с рекламы", count(sum(days, "orders")), `за ${state.range} дн.`, "var(--green)"),
    ].join("");
    if (!campaigns.length) { $("adsTable").innerHTML = `<tr><td class="empty">Активных кампаний нет или нет доступа к рекламе</td></tr>`; return; }
    const rows = campaigns.map(campaign => `<tr>
      <td><div class="pname">Кампания ${escapeHtml(campaign.id)}</div><div class="psub">${campaign.status === 9 ? "идет" : campaign.status === 11 ? "на паузе" : "завершена"}</div></td>
      <td class="r">${count(campaign.views)}</td><td class="r">${count(campaign.clicks)}</td><td class="r">${pct(campaign.ctr)}</td>
      <td class="r">${cny(campaign.cpc)}</td><td class="r">${cny(campaign.spent)}</td><td class="r">${count(campaign.carts)}</td>
      <td class="r">${count(campaign.orders)}</td><td class="r">${pct(campaign.drr)}</td>
    </tr>`).join("");
    $("adsTable").innerHTML = `<thead><tr><th>Кампания</th><th class="r">Показы</th><th class="r">Клики</th><th class="r">CTR</th><th class="r">Клик</th><th class="r">Расход</th><th class="r">Корзины</th><th class="r">Заказы</th><th class="r">ДРР</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function daysLeft(amount, nmId) {
    const product = state.data.products.find(item => item.nmId === nmId);
    const perDay = product ? product.orders / state.data.days.length : 0;
    return perDay ? amount / perDay : null;
  }

  function stockPill(amount, left) {
    if (amount === 0) return `<span class="pill p-red">нет</span>`;
    if (left !== null && left < LOW_STOCK_DAYS) return `<span class="pill p-org">${Math.floor(left)} дн.</span>`;
    return `<span class="pill p-ok">${left === null ? "нет заказов" : `${Math.floor(left)} дн.`}</span>`;
  }

  function renderStocks() {
    const stocks = state.data.stocks;
    if (!stocks.length) { $("stocksTable").innerHTML = `<tr><td class="empty">Нет данных по остаткам</td></tr>`; return; }
    const rows = stocks.map(stock => `<tr><td><div class="pname">${escapeHtml(stock.article || stock.sku)}</div><div class="psub">${escapeHtml(stock.warehouse)}</div></td><td class="r">${count(stock.amount)}</td><td class="r">${stockPill(stock.amount, daysLeft(stock.amount, stock.nmId))}</td></tr>`).join("");
    $("stocksTable").innerHTML = `<thead><tr><th>Товар</th><th class="r">Остаток</th><th class="r">Хватит</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function renderRegions() {
    const regions = state.data.regions;
    if (!regions.length) { $("regions").innerHTML = `<div class="empty">Заказов за период пока нет</div>`; return; }
    const top = regions[0].count;
    $("regions").innerHTML = regions.map(region => `<div class="rrow"><div class="rname">${escapeHtml(region.name)}</div><div class="rbar"><i style="width:${(region.count / top) * 100}%"></i></div><div class="rval">${count(region.count)}</div></div>`).join("");
  }

  function insights() {
    const { products, ads, stocks, days } = state.data;
    const list = [];
    const orders = sum(days, "ordersCount");
    const sales = sum(days, "salesCount");
    if (products[0]) list.push(["var(--blue)", "Главный товар", `${products[0].title || products[0].article}: ${count(products[0].orders)} заказов на ${rub(products[0].ordersSum)} за 30 дней.`]);
    if (orders) list.push(["var(--green)", "Выкуп", `Выкупили ${pct((sales / orders) * 100)} заказов. Выкупы приходят с задержкой на время доставки, последние дни занижены.`]);
    const spent = sum(ads.campaigns, "spent");
    const adOrdersSum = sum(ads.campaigns, "ordersSum");
    if (spent) list.push(["var(--purple)", "Реклама", `Потрачено ${cny(spent)}, заказов с рекламы ${count(sum(ads.campaigns, "orders"))}, ДРР ${pct(adOrdersSum ? (spent / adOrdersSum) * 100 : null)}.`]);
    const empty = stocks.filter(stock => stock.amount === 0).map(stock => stock.article || stock.sku);
    if (empty.length) list.push(["var(--red)", "Закончились", `Нет остатка: ${empty.join(", ")}. Эти товары не показываются покупателям.`]);
    if (!list.length) list.push(["var(--sub)", "Пока нет данных", "Отчет заполнится после первых заказов."]);
    return list;
  }

  function renderInsights() {
    $("insights").innerHTML = insights().map(([accent, title, text]) => `<div class="card insight" style="--ac:${accent}"><b>${escapeHtml(title)}</b><p>${escapeHtml(text)}</p></div>`).join("");
    $("dataErrors").innerHTML = state.data.errors.map(error => `<div>Нет данных «${escapeHtml(error.section)}»: проверьте, что у токена есть доступ к этому разделу.</div>`).join("");
  }

  function renderAll() {
    const updated = new Date(state.data.generatedAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    $("updated").textContent = state.data.demo ? "Демо-данные" : `Обновлено ${updated}`;
    $("footUpdated").textContent = `Данные из API Wildberries, обновляются автоматически. Последнее обновление: ${updated}`;
    $("periodText").textContent = `Период ${shortDate(state.data.period.from)} - ${shortDate(state.data.period.to)}`;
    renderKpi();
    renderChart();
    renderProducts();
    renderAds();
    renderStocks();
    renderRegions();
    renderInsights();
  }

  function showApp(data) {
    state.data = data;
    $("gate").hidden = true;
    $("app").hidden = false;
    renderAll();
  }

  async function onUnlock(event) {
    event.preventDefault();
    const button = $("unlock");
    button.disabled = true;
    $("gateError").textContent = "";
    try {
      state.sealed = state.sealed || await ReportVault.load();
      showApp(await ReportVault.unlock($("password").value, state.sealed));
    } catch (error) {
      state.failures += 1;
      $("gateError").textContent = error.message === "Данные еще не собраны" ? error.message : "Неверный пароль";
      await new Promise(resolve => setTimeout(resolve, FAIL_DELAY_MS * state.failures));
    } finally {
      $("password").value = "";
      button.disabled = false;
    }
  }

  function onChartClick(event) {
    const date = event.target.getAttribute && event.target.getAttribute("data-date");
    if (!date) return;
    state.selected = date;
    renderChart();
  }

  function onRange(event) {
    const days = Number(event.target.getAttribute("data-days"));
    if (!days) return;
    state.range = days;
    document.querySelectorAll("#rangeToggle button").forEach(button => button.classList.toggle("on", button === event.target));
    renderKpi();
    renderChart();
    renderAds();
  }

  function lock() {
    ReportVault.forget();
    state.data = null;
    $("app").hidden = true;
    $("gate").hidden = false;
  }

  async function start() {
    $("gateForm").addEventListener("submit", onUnlock);
    $("dayChart").addEventListener("click", onChartClick);
    $("dayChart").addEventListener("mouseover", onChartClick);
    $("rangeToggle").addEventListener("click", onRange);
    $("lock").addEventListener("click", lock);
    try {
      state.sealed = await ReportVault.load();
      const data = await ReportVault.unlockFromSession(state.sealed);
      if (data) showApp(data);
    } catch (error) {
      ReportVault.forget();
    }
  }

  start();
})();
