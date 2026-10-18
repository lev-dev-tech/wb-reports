const Charts = (() => {
  const DAY = { width: 900, height: 280, padLeft: 46, padRight: 12, padTop: 14, padBottom: 30 };
  const SPARK = { width: 600, height: 90 };
  const AD = { width: 600, height: 220, padLeft: 40, padRight: 40, padTop: 12, padBottom: 26 };
  const GRID_SHARES = [0.25, 0.5, 0.75, 1];
  const MAX_DAY_LABELS = 8;

  const gradients = `<defs>
    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd3b0" stop-opacity=".28"/><stop offset="1" stop-color="#5fd3b0" stop-opacity="0"/></linearGradient>
    <linearGradient id="gAmber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2a93b" stop-opacity=".35"/><stop offset="1" stop-color="#f2a93b" stop-opacity="0"/></linearGradient>
  </defs>`;

  const compact = value => (value >= 1e6 ? `${(value / 1e6).toFixed(1)}м` : value >= 1e3 ? `${Math.round(value / 1e3)}к` : `${Math.round(value)}`);

  function scale(maxValue, top, height) {
    return value => top + height - (value / maxValue) * height;
  }

  function points(values, x, y) {
    return values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  }

  function areaPath(linePoints, baseline) {
    if (!linePoints.length) return "";
    const first = linePoints[0].split(",")[0];
    const last = linePoints.at(-1).split(",")[0];
    return `M${first},${baseline} L${linePoints.join(" L")} L${last},${baseline} Z`;
  }

  function dayLabels(days, x, bottom, shortDate) {
    const every = Math.ceil(days.length / MAX_DAY_LABELS);
    return days.map((day, index) => (index % every ? "" : `<text class="axis" x="${x(index)}" y="${bottom}" text-anchor="middle">${shortDate(day.date)}</text>`)).join("");
  }

  function days(daysList, selected, shortDate) {
    const innerWidth = DAY.width - DAY.padLeft - DAY.padRight;
    const innerHeight = DAY.height - DAY.padTop - DAY.padBottom;
    const maxValue = Math.max(1, ...daysList.map(day => Math.max(day.ordersSum, day.salesSum))) * 1.08;
    const y = scale(maxValue, DAY.padTop, innerHeight);
    const step = innerWidth / daysList.length;
    const x = index => DAY.padLeft + index * step + step / 2;
    const baseline = DAY.padTop + innerHeight;
    const grid = GRID_SHARES.map(share => `<line class="gridline" x1="${DAY.padLeft}" x2="${DAY.width - DAY.padRight}" y1="${y(maxValue * share)}" y2="${y(maxValue * share)}"/><text class="axis" x="${DAY.padLeft - 8}" y="${y(maxValue * share) + 4}" text-anchor="end">${compact(maxValue * share)}</text>`).join("");
    const barWidth = Math.max(3, step * 0.62);
    const bars = daysList.map((day, index) => {
      const height = Math.max(2, baseline - y(day.ordersSum));
      return `<rect class="bar${day.date === selected ? " on" : ""}" data-index="${index}" x="${x(index) - barWidth / 2}" y="${baseline - height}" width="${barWidth}" height="${height}" rx="${Math.min(5, barWidth / 3)}" style="animation-delay:${index * 18}ms"/>`;
    }).join("");
    const salesPoints = points(daysList.map(day => day.salesSum), x, y);
    const average = daysList.reduce((total, day) => total + day.ordersSum, 0) / daysList.length;
    const hit = daysList.map((_, index) => `<rect data-index="${index}" x="${DAY.padLeft + index * step}" y="${DAY.padTop}" width="${step}" height="${innerHeight}" fill="transparent"/>`).join("");
    return `<svg viewBox="0 0 ${DAY.width} ${DAY.height}" class="grow draw" role="img" aria-label="Заказы и выкупы по дням">${gradients}${grid}${bars}
      <path class="area sales" d="${areaPath(salesPoints, baseline)}"/>
      <polyline class="line sales" points="${salesPoints.join(" ")}"/>
      <line class="avgline" x1="${DAY.padLeft}" x2="${DAY.width - DAY.padRight}" y1="${y(average)}" y2="${y(average)}"/>
      ${dayLabels(daysList, x, DAY.height - 8, shortDate)}${hit}</svg>`;
  }

  function dayIndexAt(svg, clientX, count) {
    const box = svg.getBoundingClientRect();
    const ratio = DAY.width / box.width;
    const local = (clientX - box.left) * ratio - DAY.padLeft;
    const innerWidth = DAY.width - DAY.padLeft - DAY.padRight;
    return Math.max(0, Math.min(count - 1, Math.floor((local / innerWidth) * count)));
  }

  function dayAnchor(svg, index, count) {
    const box = svg.getBoundingClientRect();
    const innerWidth = DAY.width - DAY.padLeft - DAY.padRight;
    return ((DAY.padLeft + (index + 0.5) * (innerWidth / count)) / DAY.width) * box.width;
  }

  function spark(values) {
    if (values.length < 2) return "";
    const maxValue = Math.max(1, ...values) * 1.1;
    const y = scale(maxValue, 6, SPARK.height - 6);
    const x = index => (index / (values.length - 1)) * SPARK.width;
    const linePoints = points(values, x, y);
    return `<svg viewBox="0 0 ${SPARK.width} ${SPARK.height}" preserveAspectRatio="none" class="draw" aria-hidden="true">${gradients}
      <path class="area amber" d="${areaPath(linePoints, SPARK.height)}"/>
      <polyline class="line" style="stroke:var(--amber)" points="${linePoints.join(" ")}"/></svg>`;
  }

  function ads(adDays, shortDate) {
    if (!adDays.length) return "";
    const innerWidth = AD.width - AD.padLeft - AD.padRight;
    const innerHeight = AD.height - AD.padTop - AD.padBottom;
    const baseline = AD.padTop + innerHeight;
    const step = innerWidth / adDays.length;
    const x = index => AD.padLeft + index * step + step / 2;
    const maxSpent = Math.max(1, ...adDays.map(day => day.spent)) * 1.1;
    const maxOrders = Math.max(1, ...adDays.map(day => day.orders)) * 1.1;
    const ySpent = scale(maxSpent, AD.padTop, innerHeight);
    const yOrders = scale(maxOrders, AD.padTop, innerHeight);
    const barWidth = Math.max(3, step * 0.5);
    const bars = adDays.map((day, index) => {
      const height = Math.max(1, baseline - yOrders(day.orders));
      return `<rect class="bar" style="fill:var(--mint);animation-delay:${index * 18}ms" x="${x(index) - barWidth / 2}" y="${baseline - height}" width="${barWidth}" height="${height}" rx="3"/>`;
    }).join("");
    const spendPoints = points(adDays.map(day => day.spent), x, ySpent);
    const axes = `<text class="axis" x="${AD.padLeft - 6}" y="${AD.padTop + 8}" text-anchor="end">${compact(maxSpent)}¥</text><text class="axis" x="${AD.width - AD.padRight + 6}" y="${AD.padTop + 8}">${Math.round(maxOrders)} шт</text><line class="gridline" x1="${AD.padLeft}" x2="${AD.width - AD.padRight}" y1="${baseline}" y2="${baseline}"/>`;
    return `<svg viewBox="0 0 ${AD.width} ${AD.height}" class="grow draw" role="img" aria-label="Расход на рекламу и заказы с рекламы">${axes}${bars}
      <polyline class="line spend" points="${spendPoints.join(" ")}"/>${dayLabels(adDays, x, AD.height - 6, shortDate)}</svg>
      <div class="legend" style="margin-top:8px"><span><i style="background:var(--sky)"></i>Расход, ¥</span><span><i style="background:var(--mint)"></i>Заказы с рекламы</span></div>`;
  }

  function prepareLines(root) {
    root.querySelectorAll(".draw .line").forEach(line => {
      const length = Math.ceil(line.getTotalLength ? line.getTotalLength() : 2000);
      line.style.setProperty("--len", length);
    });
  }

  return { days, dayIndexAt, dayAnchor, spark, ads, prepareLines };
})();
