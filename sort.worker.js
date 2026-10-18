"use strict";

const PRODUCTS = [
  { name: "Kopi Arabika 250g", category: "Minuman", price: 68000 },
  { name: "Teh Hijau Premium", category: "Minuman", price: 42000 },
  { name: "Susu Oat 1L", category: "Minuman", price: 39000 },
  { name: "Air Mineral 600ml", category: "Minuman", price: 5000 },
  { name: "Roti Sourdough", category: "Makanan", price: 45000 },
  { name: "Granola Madu", category: "Makanan", price: 52000 },
  { name: "Cokelat Dark 70%", category: "Makanan", price: 36000 },
  { name: "Keripik Singkong", category: "Makanan", price: 18000 },
  { name: "Sabun Organik", category: "Perawatan", price: 29000 },
  { name: "Hand Sanitizer", category: "Perawatan", price: 22000 },
  { name: "Tisu Wajah", category: "Rumah Tangga", price: 16000 },
  { name: "Lilin Aromaterapi", category: "Rumah Tangga", price: 58000 }
];

function postProgress(id, percent, label) {
  self.postMessage({ id, type: "progress", percent, label });
}

function createTransactions(id, count) {
  const result = new Array(count);
  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
    const quantity = 1 + Math.floor(Math.random() * 8);
    const discount = Math.random() < 0.22 ? 0.9 : 1;
    result[index] = {
      id: `TRX-${String(index + 1).padStart(6, "0")}`,
      product: product.name,
      category: product.category,
      date: now - Math.floor(Math.random() * 90 * 24 * 60 * 60 * 1000),
      quantity,
      total: Math.round(product.price * quantity * discount)
    };
    if ((index + 1) % 10000 === 0) postProgress(id, 4 + ((index + 1) / count) * 90, `Membuat transaksi ${index + 1} dari ${count}...`);
  }
  return result;
}

function iterativeDiscount(base, levels) {
  let total = base;
  for (let index = 0; index < levels; index += 1) {
    total *= 1 - discountAt(index, levels);
  }
  return total;
}

function recursiveDiscount(base, levels, index = 0) {
  if (index >= levels) return base;
  return recursiveDiscount(base * (1 - discountAt(index, levels)), levels, index + 1);
}

function discountAt(index, levels) {
  return (0.15 - (0.14 * index) / Math.max(1, levels - 1));
}

function measure(fn) {
  const start = performance.now();
  const value = fn();
  const end = performance.now();
  return { value, microseconds: (end - start) * 1000 };
}

function runIteration(id, base, levels) {
  const repetitions = 10000;
  const iterative = measure(() => {
    let total = base;
    for (let run = 0; run < repetitions; run += 1) total = iterativeDiscount(base, levels);
    return total;
  });
  const recursive = measure(() => {
    let total = base;
    for (let run = 0; run < repetitions; run += 1) total = recursiveDiscount(base, levels);
    return total;
  });
  let remaining = base;
  const steps = [];
  for (let index = 0; index < levels; index += 1) {
    const rate = discountAt(index, levels);
    remaining *= 1 - rate;
    steps.push({ level: index + 1, discountRate: rate, remaining });
  }
  self.postMessage({
    id,
    type: "iteration-result",
    base,
    levels,
    repetitions,
    iterative: { total: iterative.value, microseconds: iterative.microseconds },
    recursive: { total: recursive.value, microseconds: recursive.microseconds },
    steps
  });
}

function swap(values, left, right) {
  const temporary = values[left];
  values[left] = values[right];
  values[right] = temporary;
}

async function quickSort(values, id, progressStart, progressEnd) {
  const stack = [[0, values.length - 1]];
  let partitions = 0;
  let lastUpdate = performance.now();
  let elapsed = 0;
  let computeStart = performance.now();
  while (stack.length) {
    const [low, high] = stack.pop();
    if (low >= high) continue;
    const pivot = values[Math.floor((low + high) / 2)];
    let left = low;
    let right = high;
    while (left <= right) {
      while (values[left] < pivot) left += 1;
      while (values[right] > pivot) right -= 1;
      if (left <= right) {
        swap(values, left, right);
        left += 1;
        right -= 1;
      }
    }
    if (low < right) stack.push([low, right]);
    if (left < high) stack.push([left, high]);
    partitions += 1;
    if (partitions % 2048 === 0 && performance.now() - lastUpdate > 75) {
      postProgress(id, progressStart + Math.min(1, partitions / values.length) * (progressEnd - progressStart), "Quick Sort sedang mengurutkan transaksi...");
      lastUpdate = performance.now();
      elapsed += performance.now() - computeStart;
      await new Promise((resolve) => setTimeout(resolve, 0));
      computeStart = performance.now();
    }
  }
  elapsed += performance.now() - computeStart;
  postProgress(id, progressEnd, "Quick Sort selesai.");
  return { values, timeMs: elapsed };
}

async function mergeSort(values, id, progressStart, progressEnd) {
  let source = values;
  let target = new Float64Array(values.length);
  const length = source.length;
  let elapsed = 0;
  let computeStart = performance.now();
  for (let width = 1; width < length; width *= 2) {
    for (let left = 0; left < length; left += width * 2) {
      const middle = Math.min(left + width, length);
      const right = Math.min(left + width * 2, length);
      let first = left;
      let second = middle;
      let output = left;
      while (first < middle && second < right) {
        target[output++] = source[first] <= source[second] ? source[first++] : source[second++];
      }
      while (first < middle) target[output++] = source[first++];
      while (second < right) target[output++] = source[second++];
    }
    [source, target] = [target, source];
    const fraction = Math.min(1, Math.log2(width * 2) / Math.log2(Math.max(2, length)));
    postProgress(id, progressStart + fraction * (progressEnd - progressStart), `Merge Sort · lebar blok ${integerLabel(width * 2)}`);
    elapsed += performance.now() - computeStart;
    await new Promise((resolve) => setTimeout(resolve, 0));
    computeStart = performance.now();
  }
  elapsed += performance.now() - computeStart;
  postProgress(id, progressEnd, "Merge Sort selesai.");
  return { values: source, timeMs: elapsed };
}

function integerLabel(value) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function assertSorted(values, name) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] > values[index]) {
      throw new Error(`${name} menghasilkan urutan tidak valid pada indeks ${index}: ${values[index - 1]} > ${values[index]}.`);
    }
  }
}

async function insertionSort(values, id, progressStart, progressEnd) {
  let lastUpdate = performance.now();
  let elapsed = 0;
  let computeStart = performance.now();
  for (let index = 1; index < values.length; index += 1) {
    const current = values[index];
    let cursor = index - 1;
    while (cursor >= 0 && values[cursor] > current) {
      values[cursor + 1] = values[cursor];
      cursor -= 1;
    }
    values[cursor + 1] = current;
    if (index % 200 === 0 && performance.now() - lastUpdate > 75) {
      postProgress(id, progressStart + (index / values.length) * (progressEnd - progressStart), "Insertion Sort sedang mengurutkan sampel...");
      lastUpdate = performance.now();
      elapsed += performance.now() - computeStart;
      await new Promise((resolve) => setTimeout(resolve, 0));
      computeStart = performance.now();
    }
  }
  elapsed += performance.now() - computeStart;
  postProgress(id, progressEnd, "Insertion Sort selesai.");
  return { values, timeMs: elapsed };
}

async function runSorting(id, originalValues, insertionLimit) {
  if (!Array.isArray(originalValues) || originalValues.length === 0 || !originalValues.every(Number.isFinite)) {
    throw new Error("Data benchmark tidak valid atau kosong.");
  }
  const values = Float64Array.from(originalValues);
  const fullCount = values.length;
  const results = [];
  postProgress(id, 3, `Menyiapkan ${integerLabel(fullCount)} nilai transaksi...`);

  const quickResult = await quickSort(values, id, 5, 38);
  assertSorted(quickResult.values, "Quick Sort");
  results.push({ name: "Quick Sort", count: fullCount, timeMs: quickResult.timeMs, complexity: "O(n log n) avg." });

  const mergeValues = Float64Array.from(originalValues);
  const mergeResult = await mergeSort(mergeValues, id, 40, 74);
  assertSorted(mergeResult.values, "Merge Sort");
  results.push({ name: "Merge Sort", count: fullCount, timeMs: mergeResult.timeMs, complexity: "O(n log n)" });

  const insertionCount = Math.min(fullCount, Math.max(1, insertionLimit));
  const insertionValues = Float64Array.from(originalValues.slice(0, insertionCount));
  const insertionResult = await insertionSort(insertionValues, id, 76, 98);
  assertSorted(insertionResult.values, "Insertion Sort");
  results.push({
    name: "Insertion Sort",
    count: insertionCount,
    timeMs: insertionResult.timeMs,
    complexity: "O(n²) avg."
  });

  self.postMessage({ id, type: "sorting-result", results });
}

self.addEventListener("message", async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "generate") {
      const count = Number(event.data.count);
      if (!Number.isInteger(count) || count < 1 || count > 100000) throw new Error("Jumlah dataset harus berada di antara 1 dan 100.000.");
      postProgress(id, 2, "Worker mulai membuat transaksi...");
      const transactions = createTransactions(id, count);
      postProgress(id, 100, "Dataset selesai dibuat.");
      self.postMessage({ id, type: "dataset-result", transactions });
      return;
    }
    if (type === "iteration") {
      const base = Number(event.data.base);
      const levels = Number(event.data.levels);
      if (!Number.isFinite(base) || base < 1000 || base > 100000000 || !Number.isInteger(levels) || levels < 1 || levels > 40) {
        throw new Error("Input perhitungan diskon tidak valid.");
      }
      postProgress(id, 15, "Mengukur perhitungan iteratif...");
      runIteration(id, base, levels);
      return;
    }
    if (type === "sorting") {
      await runSorting(id, event.data.values, Number(event.data.insertionLimit));
      return;
    }
    throw new Error(`Jenis pekerjaan tidak dikenal: ${String(type)}`);
  } catch (error) {
    self.postMessage({ id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
