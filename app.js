"use strict";

(() => {
	const $ = (selector) => document.querySelector(selector);
	const STORE_KEY = "scicalc.v1";
	const PALETTES = {
		light: [["#1769aa", "#d35400"], ["#c0392b", "#16a085"], ["#7b2cbf", "#2a9d8f"], ["#34495e", "#f39c12"]],
		dark: [["#6cb4ee", "#f39c4a"], ["#ff7b6b", "#3ed6b5"], ["#b78cff", "#4fd1c0"], ["#9fb3c8", "#ffcc66"]],
	};
	const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const palette = () => (darkQuery.matches ? PALETTES.dark : PALETTES.light);
	const fmt = Calc.formatNumber;

	// ---------- 상태 (localStorage에 저장) ----------
	const state = (() => {
		const result = {
			angle: "rad",
			eqs: [{ l: "sin(x)", r: "0.5" }],
			view: { xmin: -10, xmax: 10, yc: 0 },
			fit: true,
			params: {},
			history: [],
		};
		try {
			const saved = JSON.parse(localStorage.getItem(STORE_KEY));
			if (saved && typeof saved === "object") {
				if (saved.angle === "deg") result.angle = "deg";
				if (Array.isArray(saved.eqs) && saved.eqs.length) {
					result.eqs = saved.eqs.map((eq) => ({ l: String(eq.l || ""), r: String(eq.r || "") })).slice(0, 8);
				}
				const v = saved.view;
				if (v && Number.isFinite(v.xmin) && Number.isFinite(v.xmax) && v.xmin < v.xmax) {
					result.view = { xmin: v.xmin, xmax: v.xmax, yc: Number.isFinite(v.yc) ? v.yc : 0 };
				}
				result.fit = saved.fit !== false;
				if (saved.params && typeof saved.params === "object") {
					for (const [k, val] of Object.entries(saved.params)) if (Number.isFinite(val)) result.params[k] = val;
				}
				if (Array.isArray(saved.history)) {
					result.history = saved.history.filter((h) => h && typeof h.expr === "string" && typeof h.result === "string").slice(0, 30);
				}
			}
		} catch (error) { /* 저장소를 못 쓰는 환경 */ }
		return result;
	})();
	let saveTimer = 0;
	const scheduleSave = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (error) { /* 무시 */ }
		}, 300);
	};
	const angleFactor = () => (state.angle === "deg" ? Math.PI / 180 : 1);

	// ---------- 탭 / 상단 버튼 ----------
	function setTab(tab) {
		document.body.dataset.tab = tab;
		document.querySelectorAll("[data-tab-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tabBtn === tab)));
		if (tab === "graph") scheduleDraw();
	}
	document.querySelectorAll("[data-tab-btn]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tabBtn)));

	const angleBtn = $("#angleBtn");
	function renderAngle() { angleBtn.textContent = state.angle === "deg" ? "DEG" : "RAD"; }
	angleBtn.addEventListener("click", () => {
		state.angle = state.angle === "deg" ? "rad" : "deg";
		renderAngle();
		updatePreview();
		scheduleDraw();
		scheduleSave();
	});

	let installPrompt = null;
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		installPrompt = event;
		$("#installBtn").hidden = false;
	});
	$("#installBtn").addEventListener("click", async () => {
		if (!installPrompt) return;
		installPrompt.prompt();
		await installPrompt.userChoice;
		installPrompt = null;
		$("#installBtn").hidden = true;
	});

	// ---------- 계산기 ----------
	const display = $("#display");
	const preview = $("#preview");
	const calcMsg = $("#calcMsg");
	let justEvaluated = false;

	const KEYS = [
		["sin(", "sin", "fn"], ["cos(", "cos", "fn"], ["tan(", "tan", "fn"], ["log(", "log", "fn"], ["ln(", "ln", "fn"], ["sqrt(", "√", "fn"],
		["7"], ["8"], ["9"], ["/", "÷", "op"], ["^", "^", "op"], ["pi", "π", "fn"],
		["4"], ["5"], ["6"], ["*", "×", "op"], ["(", "(", "fn"], [")", ")", "fn"],
		["1"], ["2"], ["3"], ["-", "−", "op"], ["e", "e", "fn"], ["."],
		["0"], ["+", "+", "op"], ["C", "C", "clear"], ["⌫", "⌫", "clear"], ["=", "=", "eq"],
	];
	const keypad = $("#keypad");
	const KEY_NAMES = { "⌫": "한 글자 지우기 (길게 누르면 전체 삭제)", C: "전체 지우기", "=": "계산", "/": "나누기", "*": "곱하기", "-": "빼기", "+": "더하기", "^": "거듭제곱", "pi": "파이", "e": "자연상수 e", "sqrt(": "제곱근", ".": "소수점", "(": "여는 괄호", ")": "닫는 괄호" };
	for (const [value, label, kind] of KEYS) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "key " + (kind || "");
		button.textContent = label || value;
		button.dataset.key = value;
		button.setAttribute("aria-label", KEY_NAMES[value] || value.replace("(", ""));
		keypad.append(button);
	}
	const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch (error) { /* 지원 안 함 */ } };
	// 버튼을 눌러도 입력창의 커서 위치가 유지되도록 포커스 이동을 막습니다.
	keypad.addEventListener("mousedown", (event) => event.preventDefault());
	// ⌫ 길게 누르면 전체 삭제
	let longPressTimer = 0;
	let longPressed = false;
	keypad.addEventListener("pointerdown", (event) => {
		const button = event.target.closest("button[data-key]");
		longPressed = false;
		if (!button || button.dataset.key !== "⌫") return;
		longPressTimer = setTimeout(() => { longPressed = true; buzz(); press("C"); }, 500);
	});
	for (const type of ["pointerup", "pointerleave", "pointercancel"]) keypad.addEventListener(type, () => clearTimeout(longPressTimer));
	keypad.addEventListener("click", (event) => {
		const button = event.target.closest("button[data-key]");
		if (!button) return;
		if (longPressed) { longPressed = false; return; }
		buzz();
		press(button.dataset.key);
	});

	function insertAt(input, text) {
		const start = input.selectionStart === null ? input.value.length : input.selectionStart;
		const end = input.selectionEnd === null ? start : input.selectionEnd;
		input.setRangeText(text, start, end, "end");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}

	function press(key) {
		calcMsg.textContent = "";
		if (key === "C") { display.value = ""; justEvaluated = false; updatePreview(); return; }
		if (key === "⌫") {
			const start = display.selectionStart === null ? display.value.length : display.selectionStart;
			const end = display.selectionEnd === null ? start : display.selectionEnd;
			if (start !== end) display.setRangeText("", start, end, "end");
			else if (start > 0) display.setRangeText("", start - 1, start, "end");
			justEvaluated = false;
			updatePreview();
			return;
		}
		if (key === "=") { calculate(); return; }
		if (justEvaluated && !["+", "-", "*", "/", "^"].includes(key)) display.value = "";
		justEvaluated = false;
		insertAt(display, key);
		display.scrollLeft = display.scrollWidth;
	}

	function errorText(error) {
		if (error instanceof ReferenceError) return error.message;
		if (error instanceof RangeError) return "계산할 수 없습니다 (0으로 나누기 등).";
		return "올바른 계산식을 입력하세요.";
	}

	function calculate() {
		const expr = display.value.trim();
		if (!expr) return;
		try {
			const text = fmt(Calc.evaluate(expr, { angle: angleFactor() }));
			state.history.unshift({ expr, result: text });
			state.history.length = Math.min(state.history.length, 30);
			display.value = text;
			justEvaluated = true;
			preview.textContent = "";
			renderHistory();
			scheduleSave();
		} catch (error) {
			calcMsg.textContent = errorText(error);
		}
	}

	function updatePreview() {
		const expr = display.value.trim();
		preview.textContent = "";
		if (!expr || /^[-+]?[\d.]+$/.test(expr)) return;
		try { preview.textContent = "= " + fmt(Calc.evaluate(expr, { angle: angleFactor() })); } catch (error) { /* 입력 중 */ }
	}
	display.addEventListener("input", () => { justEvaluated = false; updatePreview(); });
	display.addEventListener("keydown", (event) => {
		if (event.key === "Enter") { event.preventDefault(); calculate(); }
		else if (event.key === "Escape") press("C");
	});

	const historyList = $("#history");
	function renderHistory() {
		historyList.innerHTML = "";
		if (!state.history.length) {
			const li = document.createElement("li");
			li.className = "empty";
			li.textContent = "계산 기록이 여기에 쌓입니다.";
			historyList.append(li);
			return;
		}
		for (const item of state.history) {
			const li = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			const small = document.createElement("small");
			small.textContent = item.expr;
			const strong = document.createElement("strong");
			strong.textContent = "= " + item.result;
			button.append(small, strong);
			button.addEventListener("click", () => { display.value = item.result; justEvaluated = true; updatePreview(); });
			li.append(button);
			historyList.append(li);
		}
	}
	$("#clearHistory").addEventListener("click", () => { state.history = []; renderHistory(); scheduleSave(); });

	// ---------- 방정식 입력 ----------
	const eqList = $("#eqList");
	let lastEqInput = null;

	function renderEquationRows() {
		eqList.innerHTML = "";
		state.eqs.forEach((eq, index) => {
			const row = document.createElement("div");
			row.className = "eq-row";
			const swatch = document.createElement("span");
			swatch.className = "swatch";
			const left = makeEqInput(eq, "l", "f(x)  예: x^2 - 4");
			const equals = document.createElement("span");
			equals.textContent = "=";
			const right = makeEqInput(eq, "r", "g(x)");
			right.classList.add("r");
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "icon-btn";
			remove.textContent = "×";
			remove.setAttribute("aria-label", "식 삭제");
			remove.addEventListener("click", () => {
				if (state.eqs.length <= 1) return;
				state.eqs.splice(index, 1);
				renderEquationRows();
				scheduleDraw();
				scheduleSave();
			});
			row.append(swatch, left, equals, right, remove);
			eqList.append(row);
		});
		paintSwatches();
	}
	function makeEqInput(eq, side, placeholder) {
		const input = document.createElement("input");
		input.type = "text";
		input.value = eq[side];
		input.placeholder = placeholder;
		input.autocomplete = "off";
		input.autocapitalize = "off";
		input.spellcheck = false;
		input.enterKeyHint = "done";
		input.addEventListener("focus", () => { lastEqInput = input; });
		input.addEventListener("input", () => { eq[side] = input.value; scheduleDraw(); scheduleSave(); });
		input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); });
		return input;
	}
	function paintSwatches() {
		eqList.querySelectorAll(".eq-row").forEach((row, index) => {
			row.querySelector(".swatch").style.background = palette()[index % 4][0];
		});
	}
	$("#addEq").addEventListener("click", () => {
		if (state.eqs.length >= 8) return;
		state.eqs.push({ l: "", r: "0" });
		renderEquationRows();
		eqList.querySelector(".eq-row:last-child input").focus();
		scheduleSave();
	});

	const quickKeys = $("#quickKeys");
	for (const [text, label] of [["x"], ["y"], ["^"], ["("], [")"], ["pi", "π"], ["sin("], ["cos("], ["tan("], ["sqrt(", "√"], ["ln("], ["abs("]]) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label || text;
		button.addEventListener("click", () => {
			const target = lastEqInput || eqList.querySelector("input");
			if (!target) return;
			target.focus();
			insertAt(target, text);
		});
		quickKeys.append(button);
	}
	quickKeys.addEventListener("mousedown", (event) => event.preventDefault());

	// ---------- 자동 범위 ----------
	// x 범위는 해와 극값(다항식은 정확한 값)을 기준으로, y 범위는 곡선 값을 기준으로 자동으로 맞춥니다.
	// 드래그/확대를 하면 수동 모드가 되고, "자동 맞춤"으로 되돌립니다.
	let fitKey = null;
	$("#fitBtn").addEventListener("click", () => {
		state.fit = true;
		fitKey = null;
		state.view.yc = 0;
		scheduleDraw();
		scheduleSave();
	});

	const analysisCache = new Map();
	function analysisFor(item, baseEnv) {
		const used = [...item.L.vars, ...item.R.vars].filter((name) => name !== "x" && name !== "y").sort();
		const key = item.l + "=" + item.r + "|" + baseEnv.angle + "|" + used.map((name) => name + ":" + baseEnv[name]).join(",");
		let hit = analysisCache.get(key);
		if (hit) return hit;
		const env = Object.assign({}, baseEnv);
		const left = item.L.poly(env), right = item.R.poly(env);
		if (left && right) {
			const coefficients = Calc.polySub(left, right);
			hit = {
				poly: true,
				coefficients,
				roots: Calc.polyRealRoots(coefficients),
				critical: coefficients.length > 2 ? Calc.polyRealRoots(Calc.polyDeriv(coefficients)) : [],
			};
		} else {
			const F = (x) => { env.x = x; return item.L.fn(env) - item.R.fn(env); };
			hit = { poly: false, coefficients: null, roots: Calc.findRootsAuto(F), critical: [] };
		}
		if (analysisCache.size > 200) analysisCache.clear();
		analysisCache.set(key, hit);
		return hit;
	}

	function frameAround(points) {
		const lo = Math.min(...points), hi = Math.max(...points);
		const center = (lo + hi) / 2;
		const half = Math.max(((hi - lo) / 2) * 1.4, 3);
		return [center - half, center + half];
	}
	function fitWindow(analyses) {
		let lo = Infinity, hi = -Infinity;
		for (const a of analyses) {
			let window = null;
			if (a.poly) {
				window = frameAround([...a.roots, ...a.critical, 0]);
			} else {
				for (const level of [10, 100, 1000]) {
					const near = a.roots.filter((r) => Math.abs(r) <= level);
					if (near.length) { window = level === 10 ? [-10, 10] : frameAround([...near, 0]); break; }
				}
			}
			window = window || [-10, 10];
			lo = Math.min(lo, window[0]);
			hi = Math.max(hi, window[1]);
		}
		return Number.isFinite(lo) ? [lo, hi] : [-10, 10];
	}
	// ---------- 수식 분석 ----------
	const parseCache = new Map();
	function compile(source) {
		let hit = parseCache.get(source);
		if (!hit) {
			try { hit = Calc.parse(source); } catch (error) { hit = { error }; }
			if (parseCache.size > 300) parseCache.clear();
			parseCache.set(source, hit);
		}
		return hit;
	}
	function analyze() {
		const items = [];
		const names = new Set();
		state.eqs.forEach((eq, index) => {
			const l = eq.l.trim(), r = eq.r.trim();
			if (!l || !r) return;
			const L = compile(l), R = compile(r);
			const item = { index, l, r, L, R, error: L.error || R.error || null, implicit: false };
			if (!item.error) {
				item.implicit = L.vars.has("y") || R.vars.has("y");
				for (const name of [...L.vars, ...R.vars]) if (name !== "x" && name !== "y") names.add(name);
			}
			items.push(item);
		});
		return { items, names: [...names].sort() };
	}

	// ---------- 변수 슬라이더 ----------
	const paramBox = $("#params");
	let paramKey = "\u0000";
	function syncParams(names) {
		const key = names.join(",");
		if (key === paramKey) return;
		paramKey = key;
		paramBox.innerHTML = "";
		if (!names.length) {
			const p = document.createElement("p");
			p.className = "hint";
			p.textContent = "식에 조절 가능한 변수가 없습니다. 예: a*x^2 + b";
			paramBox.append(p);
			return;
		}
		for (const name of names) {
			if (!Number.isFinite(state.params[name])) state.params[name] = 0;
			const row = document.createElement("div");
			row.className = "param";
			const label = document.createElement("strong");
			label.textContent = name;
			const number = document.createElement("input");
			number.type = "number";
			number.step = "0.1";
			number.inputMode = "decimal";
			number.value = fmt(state.params[name]);
			const slider = document.createElement("input");
			slider.type = "range";
			slider.min = "-20";
			slider.max = "20";
			slider.step = "0.1";
			slider.value = String(state.params[name]);
			slider.addEventListener("input", () => {
				state.params[name] = Number(slider.value);
				number.value = fmt(state.params[name]);
				scheduleDraw();
				scheduleSave();
			});
			number.addEventListener("input", () => {
				const value = Number(number.value);
				if (number.value === "" || !Number.isFinite(value)) return;
				state.params[name] = value;
				slider.value = String(Math.max(-20, Math.min(20, value)));
				scheduleDraw();
				scheduleSave();
			});
			row.append(label, number, slider);
			paramBox.append(row);
		}
	}

	// ---------- 그래프 ----------
	const canvas = $("#graph");
	const ctx = canvas.getContext("2d");
	const resultEl = $("#eqResult");
	const probeEl = $("#probe");
	const legendEl = $("#legend");
	const MARGIN = { l: 46, t: 10, r: 12, b: 26 };
	let geo = null;
	let probeX = null;
	let rafId = 0;
	let legendKey = "";

	function scheduleDraw() {
		if (!rafId) rafId = requestAnimationFrame(draw);
	}

	function niceStep(raw) {
		const p = Math.pow(10, Math.floor(Math.log10(raw)));
		const f = raw / p;
		return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
	}
	function tickLabel(value, step) {
		if (Math.abs(value) < step * 1e-9) return "0";
		const abs = Math.abs(value);
		if (abs >= 1e6 || abs < 1e-4) return value.toExponential(1).replace(".0e", "e");
		const decimals = Math.min(10, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
		return value.toFixed(decimals);
	}

	function robustYRange(arrays) {
		const values = [];
		for (const array of arrays) for (const v of array) if (v === v) values.push(v);
		if (!values.length) return null;
		const sorted = Float64Array.from(values).sort();
		const full = [sorted[0], sorted[sorted.length - 1]];
		const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
		const robust = [at(0.01), at(0.99)];
		let [lo, hi] = full[1] - full[0] <= 5 * (robust[1] - robust[0]) ? full : robust;
		if (lo === hi) { lo -= 1; hi += 1; }
		const pad = (hi - lo) * 0.08;
		return [lo - pad, hi + pad];
	}

	function draw() {
		rafId = 0;
		const rect = canvas.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		const dpr = window.devicePixelRatio || 1;
		const W = rect.width, H = rect.height;
		if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
			canvas.width = Math.round(W * dpr);
			canvas.height = Math.round(H * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);

		const css = getComputedStyle(document.documentElement);
		const colors = { grid: css.getPropertyValue("--grid").trim(), axis: css.getPropertyValue("--axis").trim(), axisX: css.getPropertyValue("--axis-x").trim(), axisY: css.getPropertyValue("--axis-y").trim(), text: css.getPropertyValue("--muted").trim(), error: css.getPropertyValue("--error").trim(), line: css.getPropertyValue("--line").trim() };
		const colorsByEq = palette();
		paintSwatches();

		const { items, names } = analyze();
		syncParams(names);
		eqList.querySelectorAll(".eq-row").forEach((row, index) => {
			const item = items.find((it) => it.index === index);
			row.classList.toggle("invalid", Boolean(item && item.error));
		});
		const valid = items.filter((it) => !it.error);
		const message = (text, color) => {
			ctx.fillStyle = color;
			ctx.font = "14px system-ui, sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(text, W / 2, H / 2);
			geo = null;
		};
		if (!valid.length) {
			resultEl.textContent = items.length ? "식을 확인해 주세요. (예: x^2 - 4)" : "예: sin(x) = 0.5 또는 x^3 - 2*x - 5 = 0";
			probeEl.textContent = "";
			setLegend([]);
			message(items.length ? "그래프를 그릴 수 없습니다." : "함수식을 입력하세요.", items.length ? colors.error : colors.text);
			return;
		}

		const plotW = W - MARGIN.l - MARGIN.r, plotH = H - MARGIN.t - MARGIN.b;
		const env = Object.assign({ x: 0, y: 0 }, state.params, { angle: angleFactor() });
		const explicit = valid.filter((it) => !it.implicit);
		const anyImplicit = valid.some((it) => it.implicit);
		const analyses = new Map(explicit.map((it) => [it, analysisFor(it, env)]));

		// x 범위 자동 맞춤: 식이 바뀌면 새로 맞추고, 변수만 바뀌면 범위를 넓히기만 해서 화면이 흔들리지 않게 합니다.
		if (state.fit) {
			const candidate = fitWindow([...analyses.values()]);
			const key = valid.map((it) => it.l + "=" + it.r).join("|");
			if (key !== fitKey) {
				fitKey = key;
				state.view.xmin = candidate[0];
				state.view.xmax = candidate[1];
				state.view.yc = 0;
			} else {
				state.view.xmin = Math.min(state.view.xmin, candidate[0]);
				state.view.xmax = Math.max(state.view.xmax, candidate[1]);
			}
		}
		const { xmin, xmax } = state.view;

		// 곡선 샘플링
		const n = Math.max(300, Math.round(plotW * 1.5));
		for (const it of explicit) {
			it.ly = new Float64Array(n + 1);
			it.ry = new Float64Array(n + 1);
			for (let k = 0; k <= n; k++) {
				env.x = xmin + ((xmax - xmin) * k) / n;
				const a = it.L.fn(env), b = it.R.fn(env);
				it.ly[k] = Number.isFinite(a) ? a : NaN;
				it.ry[k] = Number.isFinite(b) ? b : NaN;
			}
		}

		// y 범위
		let ymin, ymax;
		if (anyImplicit) {
			const half = ((xmax - xmin) / 2) * (plotH / plotW);
			ymin = state.view.yc - half;
			ymax = state.view.yc + half;
		} else {
			const range = robustYRange(explicit.flatMap((it) => [it.ly, it.ry]));
			if (!range) { message("그래프를 그릴 수 없습니다.", colors.error); resultEl.textContent = "계산 가능한 구간이 없습니다."; return; }
			[ymin, ymax] = range;
		}
		geo = { pl: MARGIN.l, pt: MARGIN.t, plotW, plotH, xmin, xmax, ymin, ymax, anyImplicit };
		const X = (x) => MARGIN.l + ((x - xmin) / (xmax - xmin)) * plotW;
		const Y = (y) => MARGIN.t + ((ymax - y) / (ymax - ymin)) * plotH;

		// 격자 + 눈금
		ctx.font = "11px system-ui, sans-serif";
		const xStep = niceStep((xmax - xmin) / Math.max(2, plotW / 80));
		const yStep = niceStep((ymax - ymin) / Math.max(2, plotH / 60));
		ctx.lineWidth = 1;
		ctx.strokeStyle = colors.grid;
		ctx.fillStyle = colors.text;
		ctx.beginPath();
		ctx.textAlign = "center";
		for (let v = Math.ceil(xmin / xStep) * xStep; v <= xmax; v += xStep) {
			const px = Math.round(X(v)) + 0.5;
			ctx.moveTo(px, MARGIN.t);
			ctx.lineTo(px, MARGIN.t + plotH);
			ctx.fillText(tickLabel(v, xStep), px, MARGIN.t + plotH + 16);
		}
		ctx.textAlign = "right";
		for (let v = Math.ceil(ymin / yStep) * yStep; v <= ymax; v += yStep) {
			const py = Math.round(Y(v)) + 0.5;
			ctx.moveTo(MARGIN.l, py);
			ctx.lineTo(MARGIN.l + plotW, py);
			ctx.fillText(tickLabel(v, yStep), MARGIN.l - 6, py + 4);
		}
		ctx.stroke();

		ctx.save();
		ctx.beginPath();
		ctx.rect(MARGIN.l, MARGIN.t, plotW, plotH);
		ctx.clip();

		// 축: x축(y=0)과 y축(x=0)을 서로 다른 색으로 그리고 끝에 이름을 붙입니다.
		ctx.lineWidth = 2;
		ctx.font = "bold 13px system-ui, sans-serif";
		if (ymin <= 0 && ymax >= 0) {
			ctx.strokeStyle = colors.axisX;
			ctx.fillStyle = colors.axisX;
			ctx.beginPath();
			ctx.moveTo(MARGIN.l, Y(0));
			ctx.lineTo(MARGIN.l + plotW, Y(0));
			ctx.stroke();
			ctx.textAlign = "right";
			ctx.fillText("x", MARGIN.l + plotW - 6, Y(0) - 6);
		}
		if (xmin <= 0 && xmax >= 0) {
			ctx.strokeStyle = colors.axisY;
			ctx.fillStyle = colors.axisY;
			ctx.beginPath();
			ctx.moveTo(X(0), MARGIN.t);
			ctx.lineTo(X(0), MARGIN.t + plotH);
			ctx.stroke();
			ctx.textAlign = "left";
			ctx.fillText("y", X(0) + 6, MARGIN.t + 14);
		}

		// 곡선
		ctx.lineWidth = 2.2;
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		const strokeSeries = (array, color) => {
			ctx.strokeStyle = color;
			ctx.beginPath();
			let pen = false, previous = 0;
			for (let k = 0; k <= n; k++) {
				const v = array[k];
				if (v !== v) { pen = false; continue; }
				const px = MARGIN.l + (plotW * k) / n;
				const py = Math.max(-1e5, Math.min(1e5, Y(v)));
				if (!pen || Math.abs(py - previous) > plotH * 2) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
				pen = true;
				previous = py;
			}
			ctx.stroke();
		};
		valid.forEach((it) => {
			const pair = colorsByEq[it.index % 4];
			if (it.implicit) drawImplicit(it, pair[0], env, X, Y, plotW, plotH, xmin, xmax, ymin, ymax);
			else { strokeSeries(it.ly, pair[0]); strokeSeries(it.ry, pair[1]); }
		});

		// 해 표시 (첫 번째 식)
		const first = valid[0] === items[0] ? valid[0] : null;
		let roots = null;
		if (!first) {
			resultEl.textContent = "첫 번째 식을 확인해 주세요.";
		} else if (first.implicit) {
			resultEl.textContent = "y가 포함된 식은 그래프만 지원합니다.";
		} else {
			const analysis = analyses.get(first);
			roots = analysis.roots;
			if (analysis.poly && analysis.coefficients.length === 1) {
				resultEl.textContent = analysis.coefficients[0] === 0 ? "모든 x에서 성립합니다." : "해가 없습니다.";
			} else if (roots.length) {
				const shown = roots.slice().sort((p, q) => Math.abs(p) - Math.abs(q)).slice(0, 12).sort((p, q) => p - q).map(fmt).join(", ");
				resultEl.textContent = (analysis.poly ? "다항식의 모든 실수 해: " : "해: ") + shown + (roots.length > 12 ? " … (총 " + roots.length + "개)" : "");
			} else {
				resultEl.textContent = analysis.poly ? "실수 해가 없습니다." : "해를 찾지 못했습니다.";
			}
			ctx.font = "12px system-ui, sans-serif";
			ctx.textAlign = "left";
			const visibleRoots = roots.filter((root) => root >= xmin && root <= xmax);
			for (const root of visibleRoots) {
				env.x = root;
				const value = first.L.fn(env);
				if (!Number.isFinite(value)) continue;
				const px = X(root), py = Y(value);
				ctx.fillStyle = "#c0392b";
				ctx.beginPath();
				ctx.arc(px, py, 5, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 1.5;
				ctx.stroke();
				if (visibleRoots.length <= 4) {
					ctx.fillStyle = colors.error;
					ctx.fillText("x=" + fmt(root), px + 8, py - 8);
				}
			}
		}

		// 탭한 지점 값 표시
		if (probeX !== null && probeX >= xmin && probeX <= xmax && explicit.length) {
			ctx.strokeStyle = colors.axis;
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(X(probeX), MARGIN.t);
			ctx.lineTo(X(probeX), MARGIN.t + plotH);
			ctx.stroke();
			ctx.setLineDash([]);
			env.x = probeX;
			const parts = [];
			explicit.forEach((it) => {
				const pair = colorsByEq[it.index % 4];
				[[it.L, pair[0], "f"], [it.R, pair[1], "g"]].forEach(([side, color, name]) => {
					const value = side.fn(env);
					if (!Number.isFinite(value)) return;
					ctx.fillStyle = color;
					ctx.beginPath();
					ctx.arc(X(probeX), Y(value), 4.5, 0, Math.PI * 2);
					ctx.fill();
					parts.push(name + (explicit.length > 1 ? it.index + 1 : "") + "=" + fmt(value));
				});
			});
			probeEl.textContent = "x = " + fmt(probeX) + "   " + parts.join("   ");
		} else {
			probeEl.textContent = "";
		}
		ctx.restore();

		ctx.strokeStyle = colors.line;
		ctx.lineWidth = 1;
		ctx.strokeRect(MARGIN.l + 0.5, MARGIN.t + 0.5, plotW, plotH);
		setLegend(valid.map((it) => ({ text: it.implicit ? it.l + " = " + it.r : "f: " + it.l + "   g: " + it.r, color: colorsByEq[it.index % 4][0] })));
	}

	function setLegend(entries) {
		const key = entries.map((e) => e.text + e.color).join("|");
		if (key === legendKey) return;
		legendKey = key;
		legendEl.innerHTML = "";
		for (const entry of entries) {
			const span = document.createElement("span");
			const swatch = document.createElement("i");
			swatch.style.background = entry.color;
			span.append(swatch, document.createTextNode(entry.text));
			legendEl.append(span);
		}
	}

	// y가 포함된 식: marching squares로 f(x,y)=g(x,y) 곡선을 그립니다.
	const MARCH = {
		0: [], 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]],
		8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]], 15: [],
	};
	function drawImplicit(item, color, env, X, Y, plotW, plotH, xmin, xmax, ymin, ymax) {
		const nx = Math.ceil(plotW / 3), ny = Math.ceil(plotH / 3);
		const xs = new Float64Array(nx + 1), ys = new Float64Array(ny + 1);
		for (let i = 0; i <= nx; i++) xs[i] = xmin + ((xmax - xmin) * i) / nx;
		for (let j = 0; j <= ny; j++) ys[j] = ymin + ((ymax - ymin) * j) / ny;
		const F = (x, y) => { env.x = x; env.y = y; return item.L.fn(env) - item.R.fn(env); };
		const grid = new Float64Array((nx + 1) * (ny + 1));
		for (let i = 0; i <= nx; i++) {
			for (let j = 0; j <= ny; j++) {
				const v = F(xs[i], ys[j]);
				grid[i * (ny + 1) + j] = Number.isFinite(v) ? v : NaN;
			}
		}
		const lerp = (p0, p1, v0, v1) => (v0 === v1 ? (p0 + p1) / 2 : p0 + (-v0 / (v1 - v0)) * (p1 - p0));
		ctx.strokeStyle = color;
		ctx.beginPath();
		for (let i = 0; i < nx; i++) {
			for (let j = 0; j < ny; j++) {
				const c0 = grid[i * (ny + 1) + j], c1 = grid[(i + 1) * (ny + 1) + j], c2 = grid[(i + 1) * (ny + 1) + j + 1], c3 = grid[i * (ny + 1) + j + 1];
				if (c0 !== c0 || c1 !== c1 || c2 !== c2 || c3 !== c3) continue;
				const kase = (c0 >= 0 ? 1 : 0) + (c1 >= 0 ? 2 : 0) + (c2 >= 0 ? 4 : 0) + (c3 >= 0 ? 8 : 0);
				if (kase === 0 || kase === 15) continue;
				const pts = [
					[lerp(xs[i], xs[i + 1], c0, c1), ys[j], c0, c1],
					[xs[i + 1], lerp(ys[j], ys[j + 1], c1, c2), c1, c2],
					[lerp(xs[i], xs[i + 1], c3, c2), ys[j + 1], c3, c2],
					[xs[i], lerp(ys[j], ys[j + 1], c0, c3), c0, c3],
				];
				// 극(점근선)에서 부호만 바뀐 경우는 곡선이 아니므로 제외
				const ok = (p) => {
					const v = F(p[0], p[1]);
					return Number.isFinite(v) && Math.abs(v) <= Math.min(Math.abs(p[2]), Math.abs(p[3])) + 1e-9;
				};
				for (const [a, b] of MARCH[kase]) {
					if (!ok(pts[a]) || !ok(pts[b])) continue;
					ctx.moveTo(X(pts[a][0]), Y(pts[a][1]));
					ctx.lineTo(X(pts[b][0]), Y(pts[b][1]));
				}
			}
		}
		ctx.stroke();
	}

	// ---------- 제스처: 드래그 이동, 핀치/휠 확대, 탭으로 값 보기 ----------
	const pointers = new Map();
	let gesture = null;
	const local = (event) => {
		const rect = canvas.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	};
	function viewChanged() {
		state.fit = false;
		scheduleDraw();
		scheduleSave();
	}
	function panBy(dx, dy) {
		if (!geo) return;
		const xr = geo.xmax - geo.xmin;
		state.view.xmin = geo.xmin - (dx * xr) / geo.plotW;
		state.view.xmax = geo.xmax - (dx * xr) / geo.plotW;
		geo.xmin = state.view.xmin;
		geo.xmax = state.view.xmax;
		// y 범위는 항상 자동입니다. 다만 y가 들어간 식(원 등)은 세로 위치도 옮길 수 있게 합니다.
		if (geo.anyImplicit) state.view.yc += (dy * (geo.ymax - geo.ymin)) / geo.plotH;
		viewChanged();
	}
	function zoomAt(px, py, factor) {
		if (!geo) return;
		const cx = geo.xmin + ((px - geo.pl) / geo.plotW) * (geo.xmax - geo.xmin);
		const nextXmin = cx - (cx - geo.xmin) * factor, nextXmax = cx + (geo.xmax - cx) * factor;
		if (nextXmax - nextXmin < 1e-9 || nextXmax - nextXmin > 1e9) return;
		if (geo.anyImplicit) {
			const cy = geo.ymax - ((py - geo.pt) / geo.plotH) * (geo.ymax - geo.ymin);
			const t = (py - geo.pt) / geo.plotH;
			const half = ((nextXmax - nextXmin) / 2) * (geo.plotH / geo.plotW);
			state.view.yc = cy + half * (2 * t - 1);
		}
		state.view.xmin = nextXmin;
		state.view.xmax = nextXmax;
		geo.xmin = nextXmin;
		geo.xmax = nextXmax;
		viewChanged();
	}	canvas.addEventListener("pointerdown", (event) => {
		canvas.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, local(event));
		if (pointers.size === 1) gesture = { moved: 0, start: performance.now() };
		else if (gesture) gesture.moved = 99;
	});
	canvas.addEventListener("pointermove", (event) => {
		if (!pointers.has(event.pointerId)) return;
		const previous = pointers.get(event.pointerId), current = local(event);
		if (pointers.size === 1) {
			panBy(current.x - previous.x, current.y - previous.y);
			if (gesture) gesture.moved += Math.hypot(current.x - previous.x, current.y - previous.y);
		} else if (pointers.size === 2) {
			const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)[1];
			const prevDist = Math.hypot(previous.x - other.x, previous.y - other.y);
			const curDist = Math.hypot(current.x - other.x, current.y - other.y);
			const prevMid = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 };
			const curMid = { x: (current.x + other.x) / 2, y: (current.y + other.y) / 2 };
			panBy(curMid.x - prevMid.x, curMid.y - prevMid.y);
			if (prevDist > 0 && curDist > 0) zoomAt(curMid.x, curMid.y, prevDist / curDist);
		}
		pointers.set(event.pointerId, current);
	});
	const endPointer = (event) => {
		if (!pointers.has(event.pointerId)) return;
		if (event.type === "pointerup" && pointers.size === 1 && gesture && gesture.moved < 6 && performance.now() - gesture.start < 600 && geo) {
			const p = local(event);
			const inside = p.x >= geo.pl && p.x <= geo.pl + geo.plotW && p.y >= geo.pt && p.y <= geo.pt + geo.plotH;
			probeX = inside ? geo.xmin + ((p.x - geo.pl) / geo.plotW) * (geo.xmax - geo.xmin) : null;
			scheduleDraw();
		}
		pointers.delete(event.pointerId);
		if (!pointers.size) gesture = null;
	};
	canvas.addEventListener("pointerup", endPointer);
	canvas.addEventListener("pointercancel", endPointer);
	canvas.addEventListener("wheel", (event) => {
		event.preventDefault();
		const p = local(event);
		zoomAt(p.x, p.y, Math.exp(Math.max(-200, Math.min(200, event.deltaY)) * 0.0015));
	}, { passive: false });

	new ResizeObserver(scheduleDraw).observe(canvas);
	darkQuery.addEventListener("change", scheduleDraw);

	// ---------- 시작 ----------
	renderAngle();
	renderHistory();
	renderEquationRows();
	updatePreview();
	scheduleDraw();
	if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
		navigator.serviceWorker.register("sw.js").catch(() => { /* 오프라인 캐시 없이도 동작 */ });
	}
})();
