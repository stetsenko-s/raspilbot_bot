const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Минимальный DOM для проверки расчётов, обработчиков ввода и сохранения без браузера.
class Element {
  constructor(value = "") {
    this.value = value; this.style = {}; this.validity = { badInput: false };
    this.attributes = {}; this.children = []; this.dataset = {};
    this.classList = { toggle() {} };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  appendChild(child) { this.children.push(child); }
  set innerHTML(html) {
    this.html = html; this.children = [];
    this.inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => {
      const input = new Element(decode(tag.match(/value="([^"]*)"/)?.[1] || ""));
      input.checked = tag.includes("checked");
      return input;
    });
    this.buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => {
      const button = new Element();
      for (const [, key, value] of tag.matchAll(/data-(\w+)="([^"]*)"/g)) button.dataset[key] = value;
      return button;
    });
  }
  get innerHTML() { return this.html || ""; }
  querySelectorAll(selector) {
    if (selector === "input") return this.inputs || [];
    if (selector === ".part") return this.children;
    if (selector === ".eb") return (this.buttons || []).filter(b => b.dataset.k !== undefined);
    if (selector === "button") return this.buttons || [];
    throw new Error("Unknown selector: " + selector);
  }
  querySelector(selector) {
    if (selector === ".x") return this.buttons.at(-1);
    throw new Error("Unknown selector: " + selector);
  }
}

function app(stored = {}) {
  const values = { preset: "2750x1830", T: "16", kerf: "4", trim: "10", res: "10" };
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element(values[id] || ""));
    return elements.get(id);
  };
  const storage = new Map(Object.entries(stored));
  const context = vm.createContext({
    window: { scrollTo() {} },
    document: { getElementById: get, createElement: () => new Element() },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  });
  vm.runInContext(source, context);
  return {
    get, storage,
    run: code => vm.runInContext(code, context),
    sheet(W = 100, H = 100, kerf = 0, trim = 0) {
      for (const [id, value] of Object.entries({ W, H, kerf, trim, preset: "custom" })) get(id).value = String(value);
    },
    part(overrides = {}) {
      const p = { n: "", w: 20, h: 20, q: 1, tex: true, e: [0, 0, 0, 0], ...overrides };
      vm.runInContext(`parts = [${JSON.stringify(p)}]; renderParts(); calc();`, context);
    }
  };
}

test("Все детали слишком велики: предупреждение и пустая карта без падения", () => {
  const a = app(); a.sheet(); a.part({ w: 101, h: 50 });
  assert.equal(a.run("result.sheets.length"), 0);
  assert.match(a.get("warn").textContent, /Не помещаются/);
  assert.match(a.get("mapBox").innerHTML, /Ни одна деталь/);
  assert.equal(a.get("nWaste").textContent, "0%");
});

test("Отрицательные параметры и нулевая полезная область очищают прежнюю карту", () => {
  for (const [id, invalid] of [["kerf", -20], ["trim", -10], ["trim", 50], ["W", -100], ["H", 0], ["T", 0], ["res", -1], ["W", "Infinity"]]) {
    const a = app(); a.sheet(); a.part();
    assert.match(a.get("mapBox").innerHTML, /<svg/);
    a.get(id).value = String(invalid); a.run("calc()");
    assert.equal(a.run("result"), null, id);
    assert.equal(a.get(id).attributes["aria-invalid"], "true", id);
    assert.doesNotMatch(a.get("mapBox").innerHTML, /<svg/);
    assert.ok(a.get("warn").textContent.length > 0);
  }
});

test("Количество не округляется и не обрезается молча", () => {
  for (const q of [0, -1, 1.2, 501, ""]) {
    const a = app(); a.sheet(); a.part({ q });
    assert.equal(a.run("result"), null);
    assert.match(a.get("warn").textContent, /целым числом от 1 до 500/);
  }
  const a = app(); a.sheet(); a.part({ w: 1, h: 1, q: 500 });
  assert.equal(a.run("result.count"), 500);
});

test("Общий лимит проверяется до раскроя", () => {
  const a = app(); a.sheet();
  a.run('parts = Array.from({length: 11}, () => ({...newPart(), w: 1, h: 1, q: 500})); renderParts(); calc();');
  assert.equal(a.run("result"), null);
  assert.match(a.get("warn").textContent, /5000/);
});

test("Неполные детали и badInput не теряются в расчёте", () => {
  const a = app(); a.sheet(); a.part({ h: "" });
  assert.equal(a.run("result"), null);
  assert.match(a.get("warn").textContent, /ширина/);
  a.part({ w: "", h: "" });
  assert.equal(a.get("warn").textContent, "");
  a.get("parts").children[0].inputs[1].validity.badInput = true;
  a.run("calc()");
  assert.match(a.get("warn").textContent, /длина/);
});

test("При перезагрузке восстанавливаются детали и все параметры листа", () => {
  const a = app(); a.sheet(2440, 1220, 3.2, 8);
  a.get("T").value = "18"; a.get("res").value = "15";
  a.part({ n: "Боковина", w: 600.5, h: 400, q: 2, tex: false, e: [1, 2, 0, 0] });
  const b = app(Object.fromEntries(a.storage));
  for (const id of ["preset", "W", "H", "T", "kerf", "trim", "res"]) assert.equal(b.get(id).value, a.get(id).value);
  assert.equal(b.run("parts[0].n"), "Боковина");
  assert.equal(b.run("result.count"), 2);
  assert.equal(b.run("result.T"), 18);
});

test("Старые сохранения мигрируют, неполные объекты и битый JSON не ломают загрузку", () => {
  const legacy = app({ "cut-parts": JSON.stringify([null, 1, { n: "Старая", w: 50, h: 50 }]) });
  assert.equal(legacy.run("parts.length"), 1);
  assert.equal(legacy.run("result.count"), 1);
  assert.equal(legacy.run("parts[0].e.length"), 4);
  assert.ok(legacy.storage.has("cut-project"));
  const broken = app({ "cut-project": "{", "cut-parts": "not JSON" });
  assert.equal(broken.run("parts.length"), 1);
  assert.equal(broken.run("result"), null);
});

test("Добавленная пустая карточка сохраняется сразу", () => {
  const a = app(); a.get("add").onclick();
  assert.equal(JSON.parse(a.storage.get("cut-project")).parts.length, 2);
});

test("Импорт соблюдает столбцы и сохраняет дробные размеры и числовые названия", () => {
  const a = app();
  for (const [line, name, w, h, q] of [
    ["Боковина;600,5;400;2", "Боковина", 600.5, 400, 2],
    ["123;600;400;2", "123", 600, 400, 2],
    ["2 боковина\t600\t400\t1", "2 боковина", 600, 400, 1],
    ["600;400;3", "", 600, 400, 3],
    ["600;400", "", 600, 400, 1],
    [";600;400;", "", 600, 400, 1]
  ]) {
    const parsed = a.run(`parseRow(${JSON.stringify(line)})`);
    assert.equal(parsed.part.n, name); assert.equal(parsed.part.w, w);
    assert.equal(parsed.part.h, h); assert.equal(parsed.part.q, q);
  }
  for (const line of ["600;;2", "Полка;600;400;0", "600;400;1.2", "600;400;501", "600;400;1;extra", "Полка;-600;400;1"]) {
    assert.ok(a.run(`parseRow(${JSON.stringify(line)}).error`), line);
  }
});

test("Смешанный импорт добавляет только корректные строки и оставляет ошибочные для исправления", () => {
  const a = app();
  a.get("paste").value = "Полка;600;400;2\n600;;1";
  a.get("pasteBtn").onclick();
  assert.equal(a.run("parts.length"), 1);
  assert.equal(a.run("parts[0].q"), 2);
  assert.equal(a.get("paste").value, "600;;1");
  assert.match(a.get("pasteStatus").textContent, /Строка 2/);
  assert.match(a.get("pasteStatus").textContent, /Добавлено строк: 1/);
  a.get("paste").value = "600;400;0"; a.get("pasteBtn").onclick();
  assert.equal(a.run("parts[0].n"), "Полка");
});

test("Поворот и метраж кромки сохраняют исходные стороны", () => {
  const a = app(); a.sheet(100, 60); a.part({ w: 50, h: 90, tex: false, e: [1, 2, 0, 0] });
  assert.equal(a.run("result.count"), 1);
  assert.equal(a.run("result.sheets[0].placed[0].w"), 90);
  assert.equal(a.run("result.edge[1]"), 50);
  assert.equal(a.run("result.edge[2]"), 90);
  a.part({ w: 50, h: 90, tex: true });
  assert.equal(a.run("result.failed.length"), 1);
});

test("Детали остаются внутри полезной области и не пересекаются", () => {
  const a = app(); a.sheet(100, 80, 4, 5);
  a.run('parts = [{...newPart(), w: 25, h: 20, q: 12, tex: false}]; renderParts(); calc();');
  const sheets = a.run("result.sheets");
  let count = 0;
  for (const sheet of sheets) {
    for (const p of sheet.placed) {
      assert.ok(p.x >= 5 && p.y >= 5 && p.x + p.w <= 95 && p.y + p.h <= 75);
      count++;
    }
    for (let i = 0; i < sheet.placed.length; i++) for (let j = i + 1; j < sheet.placed.length; j++) {
      const p = sheet.placed[i], q = sheet.placed[j];
      assert.ok(p.x + p.w + 4 <= q.x || q.x + q.w + 4 <= p.x || p.y + p.h + 4 <= q.y || q.y + q.h + 4 <= p.y);
    }
  }
  assert.equal(count, 12);
});

test("Дробная деталь точно по полезному размеру помещается в лист", () => {
  const a = app(); a.sheet(1918.6, 1728.8, 4.7, 3.7);
  a.part({ w: 1911.2, h: 1721.4 });
  assert.equal(a.run("result.count"), 1);
  assert.equal(a.run("result.failed.length"), 0);
  assert.equal(a.run("result.sheets.length"), 1);
  assert.equal(a.run("result.sheets[0].free.length"), 0);
  assert.equal(a.get("warn").textContent, "");
});

test("Дробные детали и пропил ровно заполняют один лист по обеим осям", () => {
  for (const vertical of [false, true]) {
    const a = app(); a.sheet(vertical ? 1830 : 2750, vertical ? 2750 : 1830, 3.2, 10);
    const parts = [1000.1, 1726.7].map(size => ({
      n: "", w: vertical ? 1810 : size, h: vertical ? size : 1810,
      q: 1, tex: true, e: [1, 2, 0, 0]
    }));
    a.run(`parts = ${JSON.stringify(parts)}; renderParts(); calc();`);
    assert.equal(a.run("result.sheets.length"), 1);
    assert.equal(a.run("result.count"), 2);
    assert.equal(a.run("result.failed.length"), 0);
    assert.equal(a.run("result.sheets[0].free.length"), 0);
    assert.equal(a.run("result.edge[1]"), vertical ? 3620 : 2726.8);
    assert.equal(a.run("result.edge[2]"), vertical ? 2726.8 : 3620);
  }
});

test("Допуск дробных вычислений не разрешает реальное превышение размера", () => {
  for (const dims of [{ w: 1911.201, h: 1721.4 }, { w: 1911.2, h: 1721.401 }]) {
    const a = app(); a.sheet(1918.6, 1728.8, 4.7, 3.7); a.part(dims);
    assert.equal(a.run("result.failed.length"), 1);
    assert.equal(a.run("result.count"), 0);
  }
  const a = app(); a.sheet(2750, 1830, 3.2, 10);
  a.run('parts = [1000.1, 1726.701].map(w => ({...newPart(), w, h: 1810})); renderParts(); calc();');
  assert.equal(a.run("result.sheets.length"), 2);
});
