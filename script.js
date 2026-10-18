"use strict";

const PAGE_NAMES = {
  dashboard: "Overview",
  dataset: "Dataset",
  iteration: "Iterasi vs Rekursi",
  sorting: "Benchmark Sorting",
  report: "Analisis & Laporan"
};
const PAGE_SIZE = 12;
const INSERTION_LIMIT = 5000;
const SORTING_MIN_LOADING_DURATION = 3200;
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("id-ID");
const decimals = (value, digits = 3) => new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
}).format(value);
const worker = new Worker("sort.worker.js");

let transactions = [];
let currentPage = 1;
let activeJob = null;
let sortingResults = [];
let searchTimer = null;
let speedtestFrame = 0;
let sortingLoadingStartedAt = 0;
let sortingLoadingInterval = 0;
let sortingCompletionTimeout = 0;
let sortingWorkerLabel = "Menjalankan komputasi di Web Worker";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setWorkerStatus(status, busy = false) {
  const label = $("#worker-status");
  label.textContent = status;
  label.classList.toggle("text-cyan", busy);
  label.classList.toggle("text-slate-400", !busy);
}

function notify(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = "toast pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-xl " +
    (type === "error" ? "border-rose-300/20 bg-[#281822]/95 text-rose-100" : "border-mint/20 bg-[#10251f]/95 text-slate-100");
  const icon = document.createElement("i");
  icon.dataset.lucide = type === "error" ? "circle-alert" : "circle-check";
  icon.className = "h-4 w-4 shrink-0 " + (type === "error" ? "text-rose-300" : "text-mint");
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(icon, text);
  $("#toast-region").append(toast);
  if (window.lucide) window.lucide.createIcons({ nodes: [toast] });
  window.setTimeout(() => toast.remove(), 4200);
}

function showPage(page) {
  if (!PAGE_NAMES[page]) return;
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $("#breadcrumb").textContent = PAGE_NAMES[page];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function sendJob(type, payload) {
  if (activeJob) {
    notify("Worker sedang mengerjakan proses lain. Tunggu hingga proses selesai.", "error");
    return false;
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  activeJob = { id, type };
  setWorkerStatus("WORKER BUSY", true);
  worker.postMessage({ id, type, ...payload });
  return true;
}

function completeJob() {
  activeJob = null;
  setWorkerStatus("WORKER IDLE");
}

worker.addEventListener("message", (event) => {
  const message = event.data;
  if (!activeJob || message.id !== activeJob.id) return;
  if (message.type === "progress") {
    handleProgress(activeJob.type, message);
    return;
  }
  const jobType = activeJob.type;
  completeJob();
  if (message.type === "error") {
    handleWorkerFailure(jobType, message.message || "Worker gagal menyelesaikan komputasi.");
    return;
  }
  if (jobType === "generate") handleGeneratedData(message);
  if (jobType === "iteration") handleIterationResult(message);
  if (jobType === "sorting") handleSortingResult(message);
});

worker.addEventListener("error", (event) => {
  if (activeJob) {
    const jobType = activeJob.type;
    showProgressState(activeJob.type, false);
    completeJob();
    handleWorkerFailure(jobType, `Worker gagal: ${event.message || "kesalahan komputasi tidak diketahui"}`);
    return;
  }
  notify(`Worker gagal: ${event.message || "kesalahan komputasi tidak diketahui"}`, "error");
});

function showProgressState(type, visible) {
  if (type === "generate") $("#dataset-progress-wrap").classList.toggle("hidden", !visible);
  if (type === "sorting") $("#sorting-progress-card").classList.toggle("hidden", !visible);
}

function handleProgress(jobType, message) {
  const percent = Math.max(0, Math.min(100, message.percent || 0));
  if (jobType === "generate") {
    $("#dataset-progress-wrap").classList.remove("hidden");
    $("#dataset-progress-label").textContent = message.label || "Membuat dataset...";
    $("#dataset-progress-value").textContent = `${Math.round(percent)}%`;
    $("#dataset-progress-bar").style.width = `${percent}%`;
  }
  if (jobType === "sorting") {
    sortingWorkerLabel = message.label || sortingWorkerLabel;
    $("#sorting-worker-note").textContent = `Worker: ${sortingWorkerLabel}`;
  }
}

function handleGeneratedData(message) {
  resetGenerateButton();
  transactions = message.transactions || [];
  currentPage = 1;
  $("#dataset-progress-wrap").classList.add("hidden");
  populateCategoryFilter();
  renderDataset();
  updateOverview();
  notify(`${integer.format(transactions.length)} transaksi berhasil dibuat.`);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function populateCategoryFilter() {
  const select = $("#category-filter");
  const selected = select.value;
  const categories = [...new Set(transactions.map((item) => item.category))].sort();
  select.replaceChildren(new Option("Semua kategori", ""));
  categories.forEach((category) => select.add(new Option(category, category)));
  if (categories.includes(selected)) select.value = selected;
}

function filteredTransactions() {
  const query = $("#search-input").value.trim().toLocaleLowerCase("id-ID");
  const category = $("#category-filter").value;
  return transactions.filter((item) => {
    const matchesQuery = !query || item.id.toLocaleLowerCase("id-ID").includes(query) || item.product.toLocaleLowerCase("id-ID").includes(query);
    return matchesQuery && (!category || item.category === category);
  });
}

function renderDataset() {
  const filtered = filteredTransactions();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  currentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = filtered.slice(start, start + PAGE_SIZE);
  const body = $("#dataset-body");
  body.replaceChildren();
  pageData.forEach((item) => {
    const row = document.createElement("tr");
    row.className = "table-row";
    const fields = [
      { value: item.id, className: "mono px-5 py-3 text-violet-200" },
      { value: item.product, className: "px-4 py-3 font-medium text-slate-200" },
      { value: item.category, className: "px-4 py-3 text-slate-400" },
      { value: formatDate(item.date), className: "px-4 py-3 text-slate-400" },
      { value: integer.format(item.quantity), className: "mono px-4 py-3 text-right text-slate-300" },
      { value: money.format(item.total), className: "mono px-5 py-3 text-right text-cyan" }
    ];
    fields.forEach((field) => {
      const cell = document.createElement("td");
      cell.className = field.className;
      cell.textContent = field.value;
      row.append(cell);
    });
    body.append(row);
  });
  $("#dataset-empty").classList.toggle("hidden", pageData.length > 0);
  if (!transactions.length) $("#dataset-empty").textContent = "Belum ada data. Generate dataset untuk memulai.";
  else if (!filtered.length) $("#dataset-empty").textContent = "Tidak ada transaksi yang cocok dengan pencarian atau filter.";
  $("#dataset-count").textContent = integer.format(transactions.length);
  $("#dataset-sales").textContent = money.format(transactions.reduce((sum, item) => sum + item.total, 0));
  const status = $("#dataset-status");
  status.replaceChildren();
  const statusDot = document.createElement("span");
  statusDot.className = `h-1.5 w-1.5 rounded-full ${transactions.length ? "bg-mint" : "bg-slate-500"}`;
  status.append(statusDot, document.createTextNode(transactions.length ? `${integer.format(transactions.length)} record aktif` : "Kosong"));
  const shownStart = filtered.length ? start + 1 : 0;
  $("#pagination-info").textContent = `Menampilkan ${integer.format(shownStart)}–${integer.format(Math.min(start + PAGE_SIZE, filtered.length))} dari ${integer.format(filtered.length)} data`;
  $("#page-indicator").textContent = `${totalPages ? currentPage : 0} / ${totalPages}`;
  $("#prev-page").disabled = currentPage <= 1 || totalPages === 0;
  $("#next-page").disabled = currentPage >= totalPages || totalPages === 0;
}

function updateOverview() {
  const totalSales = transactions.reduce((sum, item) => sum + item.total, 0);
  $("#overview-count").textContent = integer.format(transactions.length);
  $("#overview-sales").textContent = money.format(totalSales);
}

function runGeneration() {
  if (activeJob) {
    notify("Selesaikan proses yang sedang berjalan terlebih dahulu.", "error");
    return;
  }
  $("#generate-btn").disabled = true;
  $("#generate-btn").classList.add("opacity-60");
  $("#dataset-progress-wrap").classList.remove("hidden");
  $("#dataset-progress-label").textContent = "Meminta worker membuat transaksi...";
  $("#dataset-progress-value").textContent = "0%";
  $("#dataset-progress-bar").style.width = "0%";
  const sent = sendJob("generate", { count: 100000 });
  if (!sent) {
    $("#generate-btn").disabled = false;
    $("#generate-btn").classList.remove("opacity-60");
  }
}

function resetGenerateButton() {
  $("#generate-btn").disabled = false;
  $("#generate-btn").classList.remove("opacity-60");
}

function validateIterationInput() {
  const base = Number($("#discount-base").value);
  const levels = Number($("#discount-levels").value);
  if (!Number.isFinite(base) || base < 1000 || base > 100000000) {
    notify("Subtotal harus berada di antara Rp1.000 dan Rp100.000.000.", "error");
    return null;
  }
  if (!Number.isInteger(levels) || levels < 1 || levels > 40) {
    notify("Jumlah tingkat diskon harus berupa bilangan bulat antara 1 dan 40.", "error");
    return null;
  }
  return { base, levels };
}

function startIteration() {
  const input = validateIterationInput();
  if (!input) return;
  if (!sendJob("iteration", input)) return;
  $("#run-iteration").disabled = true;
  $("#run-iteration").classList.add("opacity-60");
  resetSpeedtest();
  $("#speedtest-status").textContent = "MENJALANKAN TES";
  $("#speedtest-status").className = "mono rounded-full border border-cyan/20 bg-cyan/[.06] px-2.5 py-1 text-[9px] text-cyan";
  $("#iterative-speed-state").textContent = "MENGUKUR...";
  $("#recursive-speed-state").textContent = "MENGUKUR...";
  resetVisualizers();
}

function resetVisualizers() {
  $("#loop-visualizer").replaceChildren();
  $("#stack-visualizer").replaceChildren();
  $("#loop-step-label").textContent = "menyiapkan";
  $("#stack-step-label").textContent = "menyiapkan";
}

function animateVisualizers(steps) {
  const loop = $("#loop-visualizer");
  const stack = $("#stack-visualizer");
  loop.replaceChildren();
  stack.replaceChildren();
  const safeSteps = steps;
  safeSteps.forEach((step, index) => {
    window.setTimeout(() => {
      $("#loop-step-label").textContent = `langkah ${step.level}/${steps.length}`;
      const node = document.createElement("span");
      node.className = "step-node grid h-7 w-7 place-items-center rounded-md border border-cyan/20 bg-cyan/[.08] mono text-[9px] text-cyan";
      node.textContent = String(step.level);
      node.title = `Diskon ${decimals(step.discountRate * 100, 1)}% · subtotal ${money.format(step.remaining)}`;
      loop.append(node);
      if (loop.children.length > 12) loop.firstElementChild.remove();
      const frame = document.createElement("div");
      frame.className = "stack-card rounded-r-md px-2 py-1 mono text-[9px] text-violet-100";
      frame.textContent = `discount(${step.level}) → ${money.format(step.remaining)}`;
      stack.prepend(frame);
      if (stack.children.length > 7) stack.lastElementChild.remove();
      $("#stack-step-label").textContent = `depth ${step.level}`;
      if (index === safeSteps.length - 1) {
        $("#loop-step-label").textContent = `${steps.length} langkah selesai`;
        $("#stack-step-label").textContent = "stack unwound";
      }
    }, index * 160);
  });
}

function formatDuration(microseconds) {
  return microseconds < 1000 ? `${decimals(microseconds, 2)} µs` : `${decimals(microseconds / 1000, 2)} ms`;
}

function formatMilliseconds(milliseconds) {
  return `${decimals(milliseconds, 2)} ms`;
}

function resetSpeedtest() {
  if (speedtestFrame) window.cancelAnimationFrame(speedtestFrame);
  speedtestFrame = 0;
  ["iterative", "recursive"].forEach((method) => {
    $(`#${method}-time`).textContent = "—";
    $(`#${method}-speed-state`).textContent = "MENUNGGU";
    $(`#${method}-dial`).style.setProperty("--dial-progress", "0deg");
    $(`#${method}-dial`).style.setProperty("--needle-angle", "-130deg");
  });
  $("#speedtest-winner").textContent = "Menunggu hasil pengukuran";
  $("#speedtest-winner").className = "mono text-[9px] text-slate-500";
}

function animateSpeedtest(result) {
  if (speedtestFrame) window.cancelAnimationFrame(speedtestFrame);
  const methods = [
    { id: "iterative", name: "Iteratif", time: result.iterative.microseconds },
    { id: "recursive", name: "Rekursif", time: result.recursive.microseconds }
  ];
  const fastest = Math.min(...methods.map((method) => method.time));
  const slowest = Math.max(...methods.map((method) => method.time));
  const scores = methods.map((method) => fastest === 0 ? 100 : Math.min(100, (fastest / method.time) * 100));
  const duration = 2600;
  const now = performance.now();
  $("#speedtest-status").textContent = "MEMUTAR HASIL";
  $("#speedtest-status").className = "mono rounded-full border border-violet-300/20 bg-violet-300/[.06] px-2.5 py-1 text-[9px] text-violet-200";
  methods.forEach((method) => {
    $(`#${method.id}-speed-state`).textContent = "MENAMPILKAN HASIL...";
    $(`#${method.id}-time`).textContent = "0,00 µs";
  });

  function draw(timestamp) {
    const elapsed = Math.min(duration, timestamp - now);
    const overall = elapsed / duration;
    methods.forEach((method, index) => {
      const phase = Math.max(0, Math.min(1, (overall * methods.length) - index));
      const eased = 1 - Math.pow(1 - phase, 3);
      const currentScore = scores[index] * eased;
      const rotation = -130 + (260 * currentScore / 100);
      const dial = $(`#${method.id}-dial`);
      dial.style.setProperty("--dial-progress", `${currentScore * 3.6}deg`);
      dial.style.setProperty("--needle-angle", `${rotation}deg`);
      $(`#${method.id}-speed-state`).textContent = phase >= 1 ? "SELESAI" : phase > 0 ? "MEMBACA HASIL..." : "MENUNGGU";
      $(`#${method.id}-time`).textContent = phase >= 1
        ? formatDuration(method.time)
        : formatDuration(method.time * eased);
    });

    if (elapsed < duration) {
      speedtestFrame = window.requestAnimationFrame(draw);
      return;
    }

    const winner = methods[scores[0] >= scores[1] ? 0 : 1];
    const ratio = slowest / Math.max(fastest, 0.001);
    $("#speedtest-status").textContent = "TES SELESAI";
    $("#speedtest-status").className = "mono rounded-full border border-mint/20 bg-mint/[.06] px-2.5 py-1 text-[9px] text-mint";
    $("#speedtest-winner").textContent = `${winner.name.toUpperCase()} LEBIH CEPAT · ${decimals(ratio, 2)}×`;
    $("#speedtest-winner").className = "mono text-[9px] font-bold text-mint";
    $("#run-iteration").disabled = false;
    $("#run-iteration").classList.remove("opacity-60");
    speedtestFrame = 0;
  }
  speedtestFrame = window.requestAnimationFrame(draw);
}

function handleIterationResult(result) {
  $("#iterative-result").textContent = `Hasil subtotal: ${money.format(result.iterative.total)}`;
  $("#recursive-result").textContent = `Hasil subtotal: ${money.format(result.recursive.total)}`;
  $("#iterative-runs").textContent = `${integer.format(result.repetitions)} kalkulasi di worker`;
  $("#recursive-runs").textContent = `${integer.format(result.repetitions)} kalkulasi di worker`;
  $("#iterative-memory").textContent = `O(1) · ${integer.format(result.levels)} tingkat`;
  $("#recursive-memory").textContent = `O(n) · ${integer.format(result.levels)} frame`;
  $("#iter-table-time").textContent = formatDuration(result.iterative.microseconds);
  $("#rec-table-time").textContent = formatDuration(result.recursive.microseconds);
  $("#iter-table-memory").textContent = "O(1) · konstan";
  $("#rec-table-memory").textContent = `O(n) · ${integer.format(result.levels)} frame`;
  animateVisualizers(result.steps);
  renderIterationComparison(result);
  updateIterationReport(result);
  animateSpeedtest(result);
  notify("Simulasi iterasi dan rekursi selesai.");
}

function updateIterationReport(result) {
  const faster = result.iterative.microseconds <= result.recursive.microseconds ? "iteratif" : "rekursif";
  const ratio = Math.max(result.iterative.microseconds, result.recursive.microseconds) / Math.max(Math.min(result.iterative.microseconds, result.recursive.microseconds), 0.001);
  $("#report-iteration").textContent = `Untuk subtotal awal ${money.format(result.base)} dengan ${result.levels} tingkat, keduanya menghasilkan ${money.format(result.iterative.total)}. Pengukuran ${integer.format(result.repetitions)} kalkulasi di worker: iteratif ${formatDuration(result.iterative.microseconds)} dan rekursif ${formatDuration(result.recursive.microseconds)}. Pada percobaan ini ${faster} lebih cepat sekitar ${decimals(ratio, 2)}×; waktu mikrobenchmark dapat berubah antar perangkat, sementara kompleksitas keduanya O(n) dan penggunaan stack berbeda.`;
}

function handleSortingResult(result) {
  const remaining = Math.max(0, SORTING_MIN_LOADING_DURATION - (performance.now() - sortingLoadingStartedAt));
  if (remaining > 0) {
    $("#sorting-progress-label").textContent = "Perhitungan selesai · menyiapkan hasil benchmark...";
    $("#sorting-worker-note").textContent = "Semua algoritma selesai. Menyusun perbandingan runtime.";
    sortingCompletionTimeout = window.setTimeout(() => finalizeSortingResult(result), remaining);
    return;
  }
  finalizeSortingResult(result);
}

function finalizeSortingResult(result) {
  stopSortingLoading();
  $("#run-sorting").disabled = false;
  $("#run-sorting").classList.remove("opacity-60");
  $("#sorting-progress-card").classList.add("hidden");
  sortingResults = result.results;
  renderSortingResults();
  renderSortingLeaderboard();
  updateOverviewSort();
  updateSortingReport();
  notify("Benchmark sorting berhasil diselesaikan.");
}

function renderSortingResults() {
  const body = $("#sorting-results");
  body.replaceChildren();
  const colors = { "Quick Sort": "text-violet-200", "Merge Sort": "text-cyan", "Insertion Sort": "text-amber-200" };
  const comparable = getComparableSortingResults();
  const fastest = comparable[0];
  const runnerUp = comparable[1];
  sortingResults.forEach((result) => {
    const row = document.createElement("tr");
    const isComparable = result.count === (fastest ? fastest.count : 0);
    const isWinner = isComparable && result === fastest;
    const score = isComparable && fastest ? Math.min(100, (fastest.timeMs / result.timeMs) * 100) : null;
    row.className = isWinner ? "bg-mint/[.045]" : "";
    const algorithm = document.createElement("td");
    algorithm.className = `px-5 py-3 font-semibold ${colors[result.name]}`;
    algorithm.textContent = result.name;
    const count = document.createElement("td");
    count.className = "mono px-3 py-3 text-right text-slate-300";
    count.textContent = integer.format(result.count);
    const time = document.createElement("td");
    time.className = `mono px-3 py-3 text-right ${isWinner ? "font-bold text-mint" : "text-slate-200"}`;
    time.textContent = formatMilliseconds(result.timeMs);
    const efficiency = document.createElement("td");
    efficiency.className = "px-3 py-3 text-right";
    const badge = document.createElement("span");
    badge.className = `inline-flex whitespace-nowrap rounded-full border px-2 py-1 mono text-[9px] ${
      isWinner ? "border-mint/25 bg-mint/10 text-mint" :
        isComparable ? "border-white/[.08] bg-white/[.03] text-slate-400" :
          "border-amber-300/20 bg-amber-300/[.06] text-amber-200"
    }`;
    badge.textContent = isWinner ? "🏆 TERCEPAT" : isComparable ? `${decimals(score, 1)}%` : "SAMPEL";
    efficiency.append(badge);
    const complexity = document.createElement("td");
    complexity.className = "mono px-5 py-3 text-right text-slate-500";
    complexity.textContent = result.complexity;
    row.append(algorithm, count, time, efficiency, complexity);
    body.append(row);
  });
  updateSortingVerdict(fastest, runnerUp, comparable);
}

function getComparableSortingResults() {
  if (!sortingResults.length) return [];
  const largestCount = Math.max(...sortingResults.map((result) => result.count));
  return sortingResults
    .filter((result) => result.count === largestCount)
    .sort((first, second) => first.timeMs - second.timeMs);
}

function renderIterationComparison(result) {
  const iterative = result.iterative.microseconds;
  const recursive = result.recursive.microseconds;
  const faster = iterative <= recursive ? "Iteratif" : "Rekursif";
  const fasterTime = Math.min(iterative, recursive);
  const slowerTime = Math.max(iterative, recursive);
  const ratio = slowerTime / Math.max(fasterTime, 0.001);
  const iterativeWidth = slowerTime ? Math.max(2, (iterative / slowerTime) * 100) : 100;
  const recursiveWidth = slowerTime ? Math.max(2, (recursive / slowerTime) * 100) : 100;
  $("#iteration-comparison").innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="mono text-[9px] tracking-wider text-slate-500">HASIL PERBANDINGAN · ${integer.format(result.repetitions)} EKSEKUSI</div>
      <span class="rounded-full border border-mint/20 bg-mint/[.08] px-2.5 py-1 text-[9px] font-bold text-mint">✓ ${faster.toUpperCase()} LEBIH CEPAT</span>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <div><div class="flex justify-between text-[10px]"><span class="text-cyan">Iteratif</span><span class="mono text-slate-300">${formatDuration(iterative)}</span></div><div class="runtime-track mt-2"><div class="runtime-fill" style="width:${iterativeWidth}%;background:linear-gradient(90deg,#37aeb7,#4de1df)"></div></div></div>
      <div><div class="flex justify-between text-[10px]"><span class="text-violet-200">Rekursif</span><span class="mono text-slate-300">${formatDuration(recursive)}</span></div><div class="runtime-track mt-2"><div class="runtime-fill" style="width:${recursiveWidth}%;background:linear-gradient(90deg,#7666e8,#b3a7ff)"></div></div></div>
    </div>
    <p class="mt-3 text-[10px] leading-relaxed text-slate-400">${faster} ${ratio < 1.01 ? "memiliki waktu yang hampir sama dengan" : `sekitar ${decimals(ratio, 2)}× lebih cepat daripada`} pendekatan lainnya pada pengukuran ini. Waktu dapat berubah antar-perangkat; kompleksitas keduanya O(n), tetapi rekursi memakai stack O(n).</p>`;
}

function renderSortingLeaderboard() {
  const comparable = getComparableSortingResults();
  const winner = comparable[0];
  const samples = sortingResults.filter((result) => result.count !== (winner ? winner.count : 0));
  [$("#sorting-ranking"), $("#overview-ranking"), $("#report-ranking")].forEach((container, index) => {
    renderRanking(container, comparable, winner, samples, index > 0);
  });
}

function renderRanking(container, comparable, winner, samples, compact) {
  container.replaceChildren();
  if (!winner) return;
  comparable.forEach((result, index) => {
    const score = winner.timeMs === 0 ? 100 : Math.min(100, (winner.timeMs / result.timeMs) * 100);
    const row = document.createElement("div");
    row.className = "runtime-row rounded-xl border p-3 " +
      (index === 0 ? "winner-glow border-mint/20" : "border-white/[.06] bg-white/[.02]");
    row.style.animationDelay = `${index * 70}ms`;
    const top = document.createElement("div");
    top.className = "flex flex-wrap items-center justify-between gap-2";
    const label = document.createElement("div");
    label.className = "flex items-center gap-2";
    const rank = document.createElement("span");
    rank.className = `grid h-6 w-6 place-items-center rounded-lg mono text-[10px] font-bold ${
      index === 0 ? "bg-mint/15 text-mint" : "bg-white/[.06] text-slate-400"
    }`;
    rank.textContent = index === 0 ? "★" : String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.className = `text-[11px] font-semibold ${index === 0 ? "text-mint" : "text-slate-200"}`;
    name.textContent = result.name;
    label.append(rank, name);
    if (index === 0) {
      const badge = document.createElement("span");
      badge.className = "rounded-full border border-mint/20 bg-mint/[.08] px-2 py-1 mono text-[8px] font-bold tracking-wider text-mint";
      badge.textContent = "TERCEPAT";
      label.append(badge);
    }
    const runtime = document.createElement("span");
    runtime.className = "mono text-[10px] text-slate-300";
    runtime.textContent = formatMilliseconds(result.timeMs);
    top.append(label, runtime);
    const barLine = document.createElement("div");
    barLine.className = "mt-3 flex items-center gap-2";
    const track = document.createElement("div");
    track.className = "runtime-track flex-1";
    const fill = document.createElement("div");
    fill.className = `runtime-fill ${index === 0 ? "winner" : ""}`;
    fill.style.width = `${score}%`;
    track.append(fill);
    const scoreLabel = document.createElement("span");
    scoreLabel.className = `mono w-12 text-right text-[9px] ${index === 0 ? "text-mint" : "text-slate-500"}`;
    scoreLabel.textContent = `${decimals(score, 1)}%`;
    barLine.append(track, scoreLabel);
    const foot = document.createElement("div");
    foot.className = "mt-1.5 text-[9px] text-slate-500";
    foot.textContent = `${integer.format(result.count)} data · ${result.complexity}`;
    row.append(top, barLine, foot);
    container.append(row);
  });
  samples.forEach((result) => {
    const note = document.createElement("div");
    note.className = "rounded-xl border border-amber-300/15 bg-amber-300/[.035] p-3";
    note.innerHTML = `<div class="flex items-center justify-between gap-2"><span class="text-[10px] font-semibold text-amber-200">${result.name} · Sampel</span><span class="mono text-[9px] text-slate-400">${formatMilliseconds(result.timeMs)}</span></div><p class="mt-1 text-[9px] leading-relaxed text-slate-500">Uji ${integer.format(result.count)} data; tidak dibandingkan sebagai pemenang karena jumlah data berbeda.</p>`;
    container.append(note);
  });
  if (compact) {
    container.classList.add("space-y-2");
    container.querySelectorAll(".runtime-row").forEach((row) => {
      row.classList.add("p-2");
      row.querySelector(".runtime-track")?.classList.add("!h-[5px]");
    });
  }
}

function updateSortingVerdict(winner, runnerUp, comparable) {
  const verdict = $("#sorting-verdict");
  if (!winner) {
    verdict.classList.add("hidden");
    return;
  }
  verdict.classList.remove("hidden");
  const ratio = runnerUp ? runnerUp.timeMs / Math.max(winner.timeMs, 0.000001) : 1;
  const gap = runnerUp ? Math.max(0, ((runnerUp.timeMs - winner.timeMs) / runnerUp.timeMs) * 100) : 0;
  const count = winner.count;
  verdict.innerHTML = `
    <div class="flex flex-wrap items-center gap-3">
      <span class="grid h-11 w-11 place-items-center rounded-xl border border-mint/20 bg-mint/10 text-xl text-mint">★</span>
      <div class="min-w-[180px] flex-1"><div class="mono text-[9px] tracking-[.14em] text-mint">PALING EFEKTIF · UJI SETARA ${integer.format(count)} DATA</div><div class="mt-1 text-lg font-bold">${winner.name}</div><p class="mt-1 text-[10px] text-slate-400">Runtime terbaik ${formatMilliseconds(winner.timeMs)} di antara ${comparable.length} algoritma dengan jumlah data yang sama.</p></div>
      <div class="rounded-xl border border-white/[.08] bg-black/10 px-4 py-3 text-center"><div class="mono text-[8px] text-slate-500">LEBIH CEPAT DARI PERINGKAT #2</div><div class="mono mt-1 text-lg font-bold text-cyan">${runnerUp ? `${decimals(ratio, 2)}×` : "—"}</div><div class="text-[9px] text-slate-500">${runnerUp ? `${decimals(gap, 1)}% lebih singkat` : "Belum ada pembanding"}</div></div>
    </div>`;
}

function updateOverviewSort() {
  const fastest = getComparableSortingResults()[0];
  $("#overview-sort").textContent = fastest ? fastest.name.replace(" Sort", "") : "—";
}

function updateSortingReport() {
  if (!sortingResults.length) return;
  const fullDataset = getComparableSortingResults();
  const fastestFull = fullDataset[0];
  const secondFull = fullDataset[1];
  const insertion = sortingResults.find((result) => result.name === "Insertion Sort");
  const insertionText = insertion
    ? insertion.count === fastestFull.count
      ? ` Insertion Sort juga diuji pada jumlah yang sama (${integer.format(insertion.count)} data), sehingga hasilnya termasuk dalam peringkat.`
      : ` Insertion Sort menyelesaikan ${integer.format(insertion.count)} data dalam ${formatMilliseconds(insertion.timeMs)}, tetapi tidak dinobatkan sebagai pemenang karena sampelnya lebih kecil.`
    : "";
  const comparison = secondFull
    ? ` ${fastestFull.name} ${decimals(secondFull.timeMs / Math.max(fastestFull.timeMs, 0.000001), 2)}× lebih cepat daripada ${secondFull.name} (${formatMilliseconds(secondFull.timeMs)}).`
    : "";
  $("#report-sorting").textContent = `Pemenang uji setara ${integer.format(fastestFull.count)} data: ${fastestFull.name}, dengan waktu ${formatMilliseconds(fastestFull.timeMs)}.${comparison} Skor efisiensi relatif di leaderboard menggunakan pemenang sebagai 100%.${insertionText} Quick Sort memiliki kompleksitas rata-rata O(n log n); Merge Sort O(n log n) dengan memori tambahan O(n). Gunakan hasil waktu sebagai indikasi pada perangkat ini, bukan jaminan universal.`;
}

function runSorting() {
  if (!transactions.length) {
    notify("Buat dataset terlebih dahulu sebelum menjalankan benchmark.", "error");
    return;
  }
  if (!sendJob("sorting", {
    values: transactions.map((transaction) => transaction.total),
    insertionLimit: INSERTION_LIMIT
  })) return;
  $("#run-sorting").disabled = true;
  $("#run-sorting").classList.add("opacity-60");
  startSortingLoading();
}

function handleWorkerFailure(jobType, message) {
  if (jobType === "iteration") {
    $("#run-iteration").disabled = false;
    $("#run-iteration").classList.remove("opacity-60");
    $("#speedtest-status").textContent = "TES GAGAL";
    $("#speedtest-status").className = "mono rounded-full border border-rose-300/20 bg-rose-300/[.06] px-2.5 py-1 text-[9px] text-rose-200";
    $("#iterative-speed-state").textContent = "GAGAL";
    $("#recursive-speed-state").textContent = "GAGAL";
  }
  if (jobType === "sorting") {
    $("#run-sorting").disabled = false;
    $("#run-sorting").classList.remove("opacity-60");
    stopSortingLoading();
  }
  if (jobType === "generate") resetGenerateButton();
  showProgressState(jobType, false);
  notify(message, "error");
}

function startSortingLoading() {
  stopSortingLoading();
  sortingLoadingStartedAt = performance.now();
  sortingWorkerLabel = "Komputasi berjalan di Web Worker agar halaman tetap responsif.";
  $("#sorting-progress-card").classList.remove("hidden");
  $("#sorting-progress-label").textContent = `Menguji ${integer.format(transactions.length)} data transaksi`;
  $("#sorting-worker-note").textContent = sortingWorkerLabel;
  $("#sorting-loading-time").textContent = "00:00";
  sortingLoadingInterval = window.setInterval(() => {
    const elapsed = Math.floor((performance.now() - sortingLoadingStartedAt) / 1000);
    const seconds = String(elapsed % 60).padStart(2, "0");
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    $("#sorting-loading-time").textContent = `${minutes}:${seconds}`;
  }, 120);
}

function stopSortingLoading() {
  if (sortingLoadingInterval) window.clearInterval(sortingLoadingInterval);
  if (sortingCompletionTimeout) window.clearTimeout(sortingCompletionTimeout);
  sortingLoadingInterval = 0;
  sortingCompletionTimeout = 0;
}

function bindEvents() {
  $$(".nav-link").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
  $$("[data-goto]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.goto)));
  $("#generate-btn").addEventListener("click", runGeneration);
  $("#search-input").addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { currentPage = 1; renderDataset(); }, 120);
  });
  $("#category-filter").addEventListener("change", () => { currentPage = 1; renderDataset(); });
  $("#prev-page").addEventListener("click", () => { currentPage -= 1; renderDataset(); });
  $("#next-page").addEventListener("click", () => { currentPage += 1; renderDataset(); });
  $("#run-iteration").addEventListener("click", startIteration);
  $("#run-sorting").addEventListener("click", runSorting);
}

function initialize() {
  bindEvents();
  renderDataset();
  updateOverview();
  if (window.lucide) window.lucide.createIcons();
}

initialize();
