/* 检验报告看板 —— 前端渲染层（公有仓库）。
 * 仅负责「展示」：从私有 API 拉取 bundle 后，在本地渲染所有图表与表格。
 * 不接触任何原始医疗数据，所有数据均在浏览器端由接口返回后渲染。
 */
(function () {
  "use strict";

  // ---------------- 配置与全局 ----------------
  var CFG = window.DASH_CONFIG || {};
  var SERIES = [];     // 指标序列
  var VITALS = null;   // 居家体征
  var MEDS = null;     // 用药
  var REPORTS = [];    // 各次报告明细
  var SUMMARY = null;  // 概览统计

  // 临床分组顺序（肾相关最前）
  var GROUP_ORDER = {
    "肾功能与代谢": 0, "尿液与泌尿": 1, "电解质紊乱": 2, "免疫抑制治疗药物": 3,
    "血常规": 4, "肝功与蛋白": 5, "凝血与炎症": 6, "心功能与心衰": 7,
    "血脂与代谢": 8, "血栓弹力图": 9
  };
  function gOrder(g) { return GROUP_ORDER[g] == null ? 9 : GROUP_ORDER[g]; }

  var QUAL_CANON = { 0: "阴性", 1: "弱阳性(±)", 2: "阳性(1+)", 3: "阳性(2+)", 4: "阳性(3+)", 5: "阳性(4+)" };

  // ---------------- 小工具 ----------------
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function refToBand(r) {
    if (!r) return null;
    var m = r.match(/>?\s*(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    m = r.match(/>\s*(\d+\.?\d*)/); if (m) return [parseFloat(m[1]), null];
    m = r.match(/<\s*(\d+\.?\d*)/); if (m) return [null, parseFloat(m[1])];
    return null;
  }
  function apiBase() {
    var q = new URLSearchParams(location.search).get("api");
    if (q) return q.replace(/\/$/, "");
    var ls = localStorage.getItem(CFG.API_BASE_KEY || "transplant_dashboard_api_base");
    if (ls) return ls.replace(/\/$/, "");
    return (CFG.API_BASE || "").replace(/\/$/, "");
  }
  function getToken() { return localStorage.getItem(CFG.TOKEN_KEY || "transplant_dashboard_token") || ""; }
  function setToken(t) { localStorage.setItem(CFG.TOKEN_KEY || "transplant_dashboard_token", t); }
  function setApiBase(u) { localStorage.setItem(CFG.API_BASE_KEY || "transplant_dashboard_api_base", u.replace(/\/$/, "")); }

  async function apiFetch(path) {
    var token = getToken();
    // serveo.net 免费隧道的浏览器请求会被插入「拦截警告页」，会顶替我们的 JSON。
    // 该请求头是 serveo 官方的 API/自动访问绕过方式（见 serveo.net/docs#browser-warning）。
    var headers = { "Authorization": "Bearer " + token, "serveo-skip-browser-warning": "true" };
    var res = await fetch(apiBase() + path, { headers: headers });
    if (!res.ok) { var e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
    return res.json();
  }

  // ---------------- 状态与令牌门禁 ----------------
  function setStatus(kind, msg) {
    var s = el("status"); if (!s) return;
    if (kind === "loading") s.innerHTML = '<span class="loader"></span>' + esc(msg);
    else if (kind === "error") s.innerHTML = '<span style="color:#d6453d">' + esc(msg) + "</span>";
    s.style.display = "block";
  }
  function clearStatus() { var s = el("status"); if (s) s.style.display = "none"; }

  function showGate(errMsg) {
    var host = el("gate-host");
    host.style.display = "block";
    host.innerHTML =
      '<div class="gate"><h2>需要访问令牌</h2>' +
      '<p>本看板的数据来自私有 API。请输入你的 Bearer 令牌以加载。' +
      '令牌仅保存在本浏览器 localStorage，不会上传到任何服务器或代码仓库。</p>' +
      '<div class="row"><input id="tok" type="password" placeholder="Bearer Token" autocomplete="off">' +
      '<button id="tok-go">加载</button></div>' +
      '<p class="muted" style="margin:10px 0 4px;font-size:12px">数据服务地址（如隧道地址变更，可在此修正）</p>' +
      '<div class="row"><input id="apibase" type="text" placeholder="https://xxxx.serveousercontent.com" autocomplete="off"></div>' +
      '<div class="err">' + esc(errMsg || "") + "</div></div>";
    var ab = el("apibase");
    if (ab) ab.value = apiBase();
    var go = function () {
      var v = el("tok").value.trim();
      if (!v) { host.querySelector(".err").textContent = "请输入令牌"; return; }
      var u = (el("apibase").value || "").trim();
      if (u) setApiBase(u);
      setToken(v); host.style.display = "none"; boot();
    };
    el("tok-go").onclick = go;
    el("tok").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
  }

  async function boot() {
    var base = apiBase();
    if (!base) {
      showGate("请先在 assets/config.js 配置 API_BASE，或通过 ?api= 指定私有服务地址；亦可在下方“数据服务地址”输入框直接填写隧道地址。");
      return;
    }
    if (!getToken()) { showGate(); return; }
    setStatus("loading", "正在从私有 API 加载数据…");
    try {
      var bundle = await apiFetch("/api/bundle");
      render(bundle);
      clearStatus();
    } catch (e) {
      if (e.status === 401) { setToken(""); showGate("令牌无效或已失效，请重新输入。"); }
      else if (e.status === 403) { showGate("该地址拒绝了本站请求（来源未在白名单 ALLOW_ORIGINS 中）。"); }
      else {
        setStatus("error",
          "无法连接数据服务（" + apiBase() + "）。常见原因：私有服务未启动、隧道已断开或地址已变更。" +
          "请重新打开 launcher（deploy/start.bat），并把最新地址填入下方输入框。" +
          "　原始错误：" + (e && e.message ? e.message : e));
        showGate("数据服务不可达，可在下方修正地址与令牌后重试。");
      }
    }
  }

  // ---------------- 渲染：概览数据条 ----------------
  function renderStats(s) {
    if (!s) return;
    el("stats").innerHTML =
      statHtml("检验报告", s.n_reports, "份", false) +
      statHtml("采血日", s.n_days, "天", false) +
      statHtml("监测指标", s.n_series, "项", false) +
      statHtml("最新异常", s.n_abnormal, "项", true);
  }
  function statHtml(k, v, u, alert) {
    return '<div class="stat' + (alert ? " alert" : "") + '"><p class="k">' + esc(k) +
      '</p><p class="v' + (alert ? " alert" : "") + '">' + esc(v) +
      '<span class="u">' + esc(u) + "</span></p></div>";
  }

  // ---------------- 渲染：居家体征 ----------------
  function genVitalsHtml(v) {
    if (!v || !v.records || !v.records.length) return "";
    var recs = v.records.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var span = v.span || [recs[0].date, recs[recs.length - 1].date];
    var rows = "";
    for (var i = recs.length - 1; i >= 0; i--) { // 倒序：最新在前
      var r = recs[i];
      var s = r.sys_mmHg, d = r.dia_mmHg;
      var bp = (s == null && d == null) ? "—" : (s != null ? s : "—") + "/" + (d != null ? d : "—");
      var uu = r.urine_ml != null ? r.urine_ml : "—";
      var ww = r.weight_kg != null ? Number(r.weight_kg).toFixed(2) : "—";
      rows += "<tr><td>" + esc(r.date) + "</td><td class='num'>" + esc(uu) +
        "</td><td class='num'>" + esc(ww) + "</td><td class='num'>" + esc(bp) + "</td></tr>";
    }
    return '' +
      '<div class="section-t">每日居家体征记录（尿量 / 体重 / 血压）</div>' +
      '<p class="hint">数据来源：居家自测表，共 <b>' + recs.length + '</b> 天记录，覆盖 <b>' + esc(span[0]) + " ~ " + esc(span[1]) +
      '</b>。体重单位 kg，尿量单位 mL，血压单位 mmHg。本表与检验报告<b>相互独立</b>，仅供日常健康监测与趋势参考。</p>' +
      '<div class="card" style="grid-column:1/-1"><div class="sub-t">体重 与 尿量（同一趋势图，左轴体重 / 右轴尿量）</div>' +
      '<div class="m-chart" style="height:300px"><canvas id="vitals-wu-canvas"></canvas></div></div>' +
      '<div class="card" style="grid-column:1/-1"><div class="sub-t">血压（高压 / 低压）</div>' +
      '<div class="m-chart" style="height:300px"><canvas id="vitals-bp-canvas"></canvas></div></div>' +
      '<div class="card" style="grid-column:1/-1"><div class="tbl-scroll scroll-wide"><table class="tbl">' +
      '<thead><tr><th>日期</th><th>尿量(mL)</th><th>体重(kg)</th><th>血压(mmHg)</th></tr></thead>' +
      '<tbody>' + rows + "</tbody></table></div></div>";
  }

  function renderVitals() {
    if (!VITALS || !VITALS.records || !VITALS.records.length) return;
    var recs = VITALS.records.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var labels = recs.map(function (r) { return r.date; });
    function fmt(v) { return (v == null) ? null : v; }
    var weight = recs.map(function (r) { return fmt(r.weight_kg); });
    var urine = recs.map(function (r) { return fmt(r.urine_ml); });
    var sys = recs.map(function (r) { return fmt(r.sys_mmHg); });
    var dia = recs.map(function (r) { return fmt(r.dia_mmHg); });

    var c1 = el("vitals-wu-canvas");
    if (c1 && window.Chart) {
      new Chart(c1, { type: "line", data: { labels: labels, datasets: [
        { label: "体重(kg)", data: weight, yAxisID: "y", borderColor: "#0e7c7b",
          backgroundColor: "rgba(14,124,123,.10)", tension: .25, borderWidth: 2, pointRadius: 3, spanGaps: true },
        { label: "尿量(mL)", data: urine, type: "bar", yAxisID: "y1",
          backgroundColor: "rgba(45,156,155,.32)", spanGaps: true }
      ] }, options: { responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top" },
          tooltip: { callbacks: { label: function (c) { var v = c.parsed.y;
            if (v == null) return c.dataset.label + ": 无记录"; return c.dataset.label + ": " + v; } } } },
        scales: { y: { position: "left", title: { display: true, text: "体重(kg)" }, grid: { drawOnChartArea: true } },
          y1: { position: "right", title: { display: true, text: "尿量(mL)" }, grid: { drawOnChartArea: false }, beginAtZero: true } } } });
    }
    // 血压图：裁剪开头无数据段
    var bpStart = labels.length;
    for (var i = 0; i < labels.length; i++) { if (sys[i] != null || dia[i] != null) { bpStart = i; break; } }
    var c2 = el("vitals-bp-canvas");
    if (c2 && window.Chart) {
      new Chart(c2, { type: "line", data: { labels: labels.slice(bpStart), datasets: [
        { label: "高压(mmHg)", data: sys.slice(bpStart), yAxisID: "y", borderColor: "#d6453d", tension: .25, borderWidth: 2, pointRadius: 3, spanGaps: true },
        { label: "低压(mmHg)", data: dia.slice(bpStart), yAxisID: "y", borderColor: "#e08a1e", tension: .25, borderWidth: 2, pointRadius: 3, spanGaps: true }
      ] }, options: { responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top" },
          tooltip: { callbacks: { label: function (c) { var v = c.parsed.y;
            if (v == null) return c.dataset.label + ": 无记录"; return c.dataset.label + ": " + v; } } } },
        scales: { y: { position: "left", title: { display: true, text: "血压(mmHg)" }, grid: { drawOnChartArea: true } } } } });
    }
  }

  // ---------------- 渲染：用药清单 ----------------
  function genMedsHtml(m) {
    if (!m || !m.meds || !m.meds.length) return "";
    var rows = "";
    m.meds.forEach(function (md) {
      var name = md.name || "—", dose = md.dose || "—",
          time = md.time || "—", qty = (md.qty == null || md.qty === "") ? "—" : String(md.qty),
          note = md.note ? md.note.replace(/\n/g, "<br>") : "—",
          indication = md.indication ? md.indication : "—";
      var paused = (String(qty) === "0") || ((md.note || "").indexOf("暂停") >= 0);
      var cls = paused ? " paused" : "";
      var badge = paused ? ' <span class="flag ab-low">暂停</span>' : "";
      rows += "<tr class='" + cls + "'><td class='name'>" + esc(name) + badge + "</td><td class='num c'>" + esc(dose) +
        "</td><td class='c'>" + esc(time) + "</td><td class='num c'>" + esc(qty) +
        "</td><td class='note'>" + note + "</td><td class='ind'><span class='ind-block'>" + esc(indication) + "</span></td></tr>";
    });
    return '' +
      '<div class="section-t">当前用药清单（药疗单）</div>' +
      '<p class="hint">数据来源：药疗单，共 <b>' + m.meds.length + '</b> 条医嘱。为医院医嘱快照（非时间序列），与检验报告、居家体征<b>相互独立</b>。' +
      '标「暂停」者为已停用医嘱。</p>' +
      '<div class="card" style="grid-column:1/-1"><div class="tbl-scroll scroll-wide"><table class="tbl meds">' +
      '<colgroup><col style="width:22%"><col style="width:8%"><col style="width:12%"><col style="width:8%"><col style="width:17%"><col style="width:28%"></colgroup>' +
      '<thead><tr><th>医嘱内容</th><th class="c">剂量</th><th class="c">执行时间</th><th class="c">数量</th><th>备注</th><th title="各药的标准临床用途">适应性</th></tr></thead>' +
      '<tbody>' + rows + "</tbody></table></div></div>";
  }

  // ---------------- 渲染：数据覆盖 ----------------
  function genCoverageHtml(cov) {
    if (!cov || !cov.length) return "";
    var rows = "";
    cov.forEach(function (c) {
      var types = c.types.map(function (t) { return t; }).join("、");
      rows += "<tr><td>" + esc(c.date) + "</td><td>" + esc(types) + "</td><td>" + esc(c.n_items) + " 项</td></tr>";
    });
    return '<details class="fold" open><summary>〇、数据覆盖</summary>' +
      '<div class="card" style="grid-column:1/-1">' +
      '<p style="padding:10px 14px 0;font-size:13px;color:#475569">共 <b>' + SUMMARY.n_reports + '</b> 份检验报告，覆盖 <b>' +
      esc(SUMMARY.date_min) + " ~ " + esc(SUMMARY.date_max) + '</b>（' + SUMMARY.n_days + ' 个采血日）。数据由本地 OCR 从检验报告原图自动提取，仅供个人健康趋势参考。</p>' +
      '<div class="tbl-scroll"><table class="tbl"><thead><tr><th>日期</th><th>当日报告类型</th><th>指标数</th></tr></thead>' +
      '<tbody>' + rows + "</tbody></table></div></div></details>";
  }

  // ---------------- 渲染：最新结果清单 ----------------
  var THEAD = "<thead><tr><th>指标（点击查看趋势）</th><th>最近检测日期</th><th>最近结果</th>" +
    "<th>参考范围</th><th>单位</th><th class='c'>检测次数</th><th class='c'>历史异常次数</th>" +
    "<th>指标说明</th></tr></thead>";
  // 固定列宽，避免新增「指标说明」列后长文本挤乱版式
  function LABS_TBL(bodyRows) {
    return "<table class='tbl labs'><colgroup>" +
      "<col style='width:15%'><col style='width:9%'><col style='width:9%'><col style='width:12%'>" +
      "<col style='width:6%'><col style='width:7%'><col style='width:8%'><col style='width:34%'>" +
      "</colgroup>" + THEAD + "<tbody>" + bodyRows + "</tbody></table>";
  }
  function rowHtml(s, i) {
    var hl = s.last_flag === "↑" ? "ab-high" : (s.last_flag === "↓" ? "ab-low" : "");
    var fh = s.last_flag ? " <span class='flag " + hl + "'>" + s.last_flag + "</span>" : "";
    var link = "<a class='lk' data-i='" + i + "' href='javascript:void(0)'>" + esc(s.name) + "</a>";
    var desc = s.desc ? "<span class='ind-block'>" + esc(s.desc) + "</span>" : "—";
    return "<tr class='" + hl + "'><td>" + link + "</td><td>" + esc(s.last_date) + "</td>" +
      "<td class='num'>" + esc(s.last_val) + fh + "</td><td>" + esc(s.ref || "—") + "</td>" +
      "<td>" + esc(s.unit || "—") + "</td><td class='c'>" + s.n + "</td><td class='c'>" + s.n_abn +
      "</td><td class='ind'>" + desc + "</td></tr>";
  }
  function genLatestHtml(series) {
    var abn = [], ok = [];
    series.forEach(function (s, i) { (s.abnormal ? abn : ok).push([i, s]); });
    function cmp(a, b) { return gOrder(a[1].group) - gOrder(b[1].group) || (a[1].name < b[1].name ? -1 : 1); }
    abn.sort(cmp); ok.sort(cmp);
    var p1 = abn.map(function (x) { return rowHtml(x[1], x[0]); }).join("");
    var p2 = ok.map(function (x) { return rowHtml(x[1], x[0]); }).join("");
    return '' +
      '<div class="section-t">一、最新结果清单（每个指标仅取最近一次检测值）</div>' +
      '<p class="hint">同一指标在多次报告中只保留<b>最近一次</b>结果，按临床关注度排序（肾相关最前）。<b>点击指标名</b>可查看该指标<b>按日期的趋势图</b>及全部历史数值。</p>' +
      '<div class="sub-t bad">异常指标 · 共 ' + abn.length + ' 项（最近一次仍超出参考范围）</div>' +
      '<div class="card" style="grid-column:1/-1"><div class="tbl-scroll scroll-wide">' +
      LABS_TBL(p1) + "</div></div>" +
      '<div class="sub-t ok">正常指标 · 共 ' + ok.length + ' 项（最近一次在参考范围内）</div>' +
      '<div class="card" style="grid-column:1/-1"><div class="tbl-scroll scroll-wide">' +
      LABS_TBL(p2) + "</div></div>";
  }

  // ---------------- 渲染：各次报告明细（倒序） ----------------
  function genReportsHtml(reps) {
    var cards = [];
    reps.slice().reverse().forEach(function (rep) { // 倒序：最新在前
      var rows = "";
      rep.items.forEach(function (it) {
        var hl = it.flag === "↑" ? "ab-high" : (it.flag === "↓" ? "ab-low" : "");
        var badge = it.flag ? "<span class='flag " + hl + "'>" + it.flag + "</span>" : "";
        rows += "<tr class='" + hl + "'><td>" + esc(it.name) + "</td><td class='num'>" + esc(it.value) +
          " " + badge + "</td><td>" + esc(it.ref) + "</td><td>" + esc(it.unit) + "</td></tr>";
      });
      var dno = (rep.dno || "").slice(-6);
      cards.push("<div class='card'><div class='card-h'><span class='date'>" + esc(rep.date) +
        "</span><span class='type'>" + esc(rep.type) + "</span><span class='cnt'>" + rep.n_items +
        " 项 · " + esc(dno) + "</span></div><div class='rep-title'>" + esc(rep.title) + "</div>" +
        "<table class='tbl'><thead><tr><th>项目</th><th>结果</th><th>参考范围</th><th>单位</th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>");
    });
    return '<details class="fold"><summary>二、各次检验报告明细（共 ' + reps.length + ' 份 · 点击展开）</summary>' +
      '<div class="grid">' + cards.join("") + "</div></details>";
  }

  // ---------------- 弹层：指标趋势 ----------------
  var _chart = null;
  function closeDetail() {
    var m = el("modal"), mask = el("mask");
    m.classList.remove("show"); mask.style.display = "none"; m.style.display = "none";
    document.body.style.overflow = "";
  }
  function openDetail(i) {
    var s = SERIES[i]; if (!s) return;
    el("m-name").textContent = s.name;
    var dir = s.last_flag;
    el("m-badge").innerHTML = dir
      ? '<span class="badge ' + (dir === "↑" ? "b-now" : "b-low") + '">' + (dir === "↑" ? "● 最近一次偏高" : "● 最近一次偏低") + "</span>"
      : '<span class="badge b-ok">○ 最近一次正常</span>';
    el("m-meta").innerHTML = "单位：<b>" + esc(s.unit || "—") + "</b>　参考范围：<b>" + esc(s.ref || "—") +
      "</b>　·　共 <b>" + s.n + "</b> 次检测，其中异常 <b>" + s.n_abn + "</b> 次　·　分组：" + esc(s.group) +
      (s.desc ? "<br><span class='m-desc-label'>指标说明：</span><span class='m-desc'>" + esc(s.desc) + "</span>" : "");
    // 历史表（倒序：最新在前）
    var h = '<div class="tbl-scroll scroll-mid"><table class="tbl"><thead><tr><th>日期</th><th>结果</th><th>参考范围</th><th>单位</th><th>报告类型</th></tr></thead><tbody>';
    for (var k = s.dates.length - 1; k >= 0; k--) {
      var f = s.flags[k], cls = f.abn ? (f.dir === "↑" ? "ab-high" : "ab-low") : "";
      var fl = f.abn ? " <span class='flag " + cls + "'>" + f.dir + "</span>" : "";
      h += "<tr class='" + cls + "'><td>" + esc(s.dates[k]) + "</td><td class='num'>" + esc(s.values[k]) + fl +
        "</td><td>" + esc(s.ref || "—") + "</td><td>" + esc(s.unit || "—") + "</td><td>" + esc(s.types[k] || "") + "</td></tr>";
    }
    h += "</tbody></table></div>";
    el("m-tbl").innerHTML = h;
    // 图（正序）
    if (_chart) { _chart.destroy(); _chart = null; }
    var idx = [];
    for (var j = 0; j < s.points.length; j++) { if (s.points[j] != null) idx.push(j); }
    if (idx.length >= 2) {
      el("m-chart").style.display = ""; el("m-nodata").style.display = "none";
      var labels = idx.map(function (k) { return s.dates[k]; });
      var data = idx.map(function (k) { return s.points[k]; });
      var band = refToBand(s.ref);
      var ds = [{ label: s.name, data: data, borderColor: "#0e7c7b",
        backgroundColor: "rgba(14,124,123,.10)", fill: true, tension: .25, borderWidth: 2,
        pointRadius: idx.map(function (k) { return s.flags[k].abn ? 7 : 4; }),
        pointBackgroundColor: idx.map(function (k) { return s.flags[k].abn ? (s.flags[k].dir === "↑" ? "#d6453d" : "#1f9d6b") : "#0e7c7b"; }),
        pointBorderColor: idx.map(function (k) { return s.flags[k].abn ? "#fff" : "#0e7c7b"; }),
        pointBorderWidth: idx.map(function (k) { return s.flags[k].abn ? 2 : 1; }) }];
      var ymin = Math.min.apply(null, data), ymax = Math.max.apply(null, data);
      if (band) {
        if (band[0] != null) { ymin = Math.min(ymin, band[0]); ds.push({ data: data.map(function () { return band[0]; }), borderColor: "#9aa9ad", borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false }); }
        if (band[1] != null) { ymax = Math.max(ymax, band[1]); ds.push({ data: data.map(function () { return band[1]; }), borderColor: "#9aa9ad", borderDash: [5, 5], borderWidth: 1, pointRadius: 0, fill: false }); }
      }
      var pad = ((ymax - ymin) || 1) * 0.18;
      var yOpts = { suggestedMin: ymin - pad, suggestedMax: ymax + pad };
      if (s.qual) {
        yOpts = { min: 0, max: 5, beginAtZero: true,
          ticks: { stepSize: 1, callback: function (v) { return QUAL_CANON[v] !== undefined ? QUAL_CANON[v] : v; } },
          title: { display: true, text: "定性等级（阴性 → 阳性）" } };
      }
      var ctx = el("m-canvas");
      if (ctx && window.Chart) {
        _chart = new Chart(ctx, { type: "line", data: { labels: labels, datasets: ds },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
              tooltip: { callbacks: { label: function (c) {
                if (c.datasetIndex > 0) return "";
                var k = idx[c.dataIndex], f = s.flags[k];
                var txt = s.qual ? s.values[k] : (c.parsed.y + (s.unit ? " " + s.unit : ""));
                return (f.abn ? "⚠ " : "") + txt + (f.abn ? " [" + f.dir + "超出参考]" : ""); } } } },
            scales: { y: yOpts } } });
      }
    } else {
      el("m-chart").style.display = "none"; el("m-nodata").style.display = "";
      el("m-nodata").textContent = "该指标仅有 " + s.n + " 次检测记录，不足以绘制趋势图（下方为全部历史数值）。";
    }
    el("mask").style.display = "block"; el("modal").style.display = "block";
    requestAnimationFrame(function () { el("modal").classList.add("show"); });
    document.body.style.overflow = "hidden";
  }

  // ---------------- 总渲染 ----------------
  function render(bundle) {
    SUMMARY = bundle.summary || {};
    SERIES = bundle.series || [];
    REPORTS = bundle.reports || [];
    VITALS = bundle.vitals || null;
    MEDS = bundle.meds || null;
    var cov = (bundle.coverage || []).slice().sort(function (a, b) {
      if (a.date === "未知") return 1; if (b.date === "未知") return -1; return a.date < b.date ? 1 : -1;
    });

    renderStats(SUMMARY);
    var wrap = el("wrap");
    wrap.innerHTML =
      genVitalsHtml(VITALS) +
      genMedsHtml(MEDS) +
      genCoverageHtml(cov) +
      genLatestHtml(SERIES) +
      genReportsHtml(REPORTS);
    renderVitals();

    var foot = el("gen-time");
    if (foot && SUMMARY.generated_at) foot.textContent = "数据生成时间：" + SUMMARY.generated_at + "　·　仅供筛查参考";
  }

  // ---------------- 事件绑定 ----------------
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest(".lk") : null;
    if (a) { e.preventDefault(); openDetail(parseInt(a.getAttribute("data-i"), 10)); return; }
    if (e.target.id === "mask" || e.target.id === "m-x") closeDetail();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });

  // ---------------- 启动 ----------------
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
