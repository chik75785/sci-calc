"use strict";

// 수식 파서 + 방정식 풀이. eval()을 쓰지 않고 직접 파싱합니다.
const Calc = (() => {
	const FUNCS = {
		sin: (v, k) => Math.sin(v * k),
		cos: (v, k) => Math.cos(v * k),
		tan: (v, k) => Math.tan(v * k),
		asin: (v, k) => Math.asin(v) / k,
		acos: (v, k) => Math.acos(v) / k,
		atan: (v, k) => Math.atan(v) / k,
		sinh: (v) => Math.sinh(v),
		cosh: (v) => Math.cosh(v),
		tanh: (v) => Math.tanh(v),
		sqrt: (v) => Math.sqrt(v),
		cbrt: (v) => Math.cbrt(v),
		log: (v) => Math.log10(v),
		ln: (v) => Math.log(v),
		exp: (v) => Math.exp(v),
		abs: (v) => Math.abs(v),
	};
	const FN_NAMES = Object.keys(FUNCS).sort((a, b) => b.length - a.length);
	const CONSTS = { pi: Math.PI, e: Math.E };

	function tokenize(source) {
		const src = source.toLowerCase()
			.replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-")
			.replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/²/g, "^2").replace(/³/g, "^3")
			.replace(/\*\*/g, "^");
		const tokens = [];
		const numberRe = /(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/y;
		const wordRe = /[a-z]+/y;
		let i = 0;
		while (i < src.length) {
			const c = src[i];
			if (/\s/.test(c)) { i++; continue; }
			numberRe.lastIndex = i;
			let m = numberRe.exec(src);
			if (m) { tokens.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
			wordRe.lastIndex = i;
			m = wordRe.exec(src);
			if (m) {
				const word = m[0];
				const end = i + word.length;
				const callFollows = /^\s*\(/.test(src.slice(end));
				let j = 0;
				while (j < word.length) {
					const rest = word.slice(j);
					const fn = FN_NAMES.find((n) => rest.startsWith(n) && j + n.length === word.length && callFollows);
					if (fn) { tokens.push({ t: "fn", v: fn }); j += fn.length; }
					else if (rest.startsWith("pi")) { tokens.push({ t: "const", v: "pi" }); j += 2; }
					else if (rest[0] === "e") { tokens.push({ t: "const", v: "e" }); j += 1; }
					else { tokens.push({ t: "var", v: rest[0] }); j += 1; }
				}
				i = end;
				continue;
			}
			if ("+-*/^()".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }
			throw new SyntaxError("지원하지 않는 문자: " + c);
		}
		return tokens;
	}

	// 반환: { fn(env) -> number, vars: Set<string> }. env는 { x, y, k, ...변수 }.
	function parse(source) {
		const tokens = tokenize(source);
		if (!tokens.length) throw new SyntaxError("식이 비어 있습니다.");
		const vars = new Set();
		let pos = 0;
		const peek = () => tokens[pos];
		const isOp = (v) => peek() !== undefined && peek().t === "op" && peek().v === v;
		const expectOp = (v) => {
			if (!isOp(v)) throw new SyntaxError("'" + v + "'가 필요합니다.");
			pos++;
		};
		const startsOperand = () => {
			const t = peek();
			return t !== undefined && (t.t === "var" || t.t === "const" || t.t === "fn" || (t.t === "op" && t.v === "("));
		};

		function parseExpression() {
			let left = parseTerm();
			while (isOp("+") || isOp("-")) {
				const op = tokens[pos++].v;
				const a = left;
				const b = parseTerm();
				left = op === "+" ? (env) => a(env) + b(env) : (env) => a(env) - b(env);
			}
			return left;
		}
		function parseTerm() {
			let left = parseUnary();
			for (;;) {
				let op = null;
				if (isOp("*") || isOp("/")) op = tokens[pos++].v;
				else if (!startsOperand()) break;
				const a = left;
				const b = op ? parseUnary() : parsePower();
				left = op === "/" ? (env) => a(env) / b(env) : (env) => a(env) * b(env);
			}
			return left;
		}
		function parseUnary() {
			if (isOp("-")) { pos++; const o = parseUnary(); return (env) => -o(env); }
			if (isOp("+")) { pos++; return parseUnary(); }
			return parsePower();
		}
		function parsePower() {
			const base = parsePrimary();
			if (isOp("^")) {
				pos++;
				const exponent = parseUnary();
				return (env) => Math.pow(base(env), exponent(env));
			}
			return base;
		}
		function parsePrimary() {
			const t = tokens[pos];
			if (!t) throw new SyntaxError("식이 끝났습니다.");
			pos++;
			if (t.t === "num") { const v = t.v; return () => v; }
			if (t.t === "const") { const v = CONSTS[t.v]; return () => v; }
			if (t.t === "var") { const name = t.v; vars.add(name); return (env) => env[name]; }
			if (t.t === "fn") {
				expectOp("(");
				const arg = parseExpression();
				expectOp(")");
				const f = FUNCS[t.v];
				return (env) => f(arg(env), env.k === undefined ? 1 : env.k);
			}
			if (t.t === "op" && t.v === "(") {
				const inner = parseExpression();
				expectOp(")");
				return inner;
			}
			throw new SyntaxError("예상하지 못한 '" + t.v + "'");
		}

		const fn = parseExpression();
		if (pos < tokens.length) throw new SyntaxError("예상하지 못한 '" + tokens[pos].v + "'");
		return { fn, vars };
	}

	function evaluate(source, env) {
		const { fn, vars } = parse(source);
		env = env || {};
		for (const name of vars) {
			if (env[name] === undefined) throw new ReferenceError("정의되지 않은 변수: " + name);
		}
		const result = fn(env);
		if (!Number.isFinite(result)) throw new RangeError("계산할 수 없습니다.");
		return result;
	}

	function formatNumber(value) {
		if (!Number.isFinite(value)) return String(value);
		if (Math.abs(value) < 1e-12) return "0";
		if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
		return String(parseFloat(value.toPrecision(10)));
	}

	function bisect(F, a, b) {
		let fa = F(a);
		for (let n = 0; n < 60; n++) {
			const m = (a + b) / 2;
			const fm = F(m);
			if (fm === 0) return m;
			if (fa * fm <= 0) b = m;
			else { a = m; fa = fm; }
		}
		return (a + b) / 2;
	}

	function uniqueRoots(roots) {
		const result = [];
		for (const r of roots.slice().sort((p, q) => p - q)) {
			if (!result.length || Math.abs(r - result[result.length - 1]) > 1e-5) result.push(r);
		}
		return result;
	}

	// F(x) = 0 인 실수 해. 부호 변화 + 접하는 중근을 찾고, 점근선(극)은 제외합니다.
	function findRoots(F, min, max) {
		if (!(min < max)) throw new RangeError("잘못된 구간");
		const N = 2000;
		const step = (max - min) / N;
		const ys = new Array(N + 1);
		for (let i = 0; i <= N; i++) {
			const v = F(min + i * step);
			ys[i] = Number.isFinite(v) ? v : null;
		}
		const roots = [];
		for (let i = 1; i <= N; i++) {
			const y0 = ys[i - 1], y1 = ys[i];
			if (y1 === null) continue;
			if (y1 === 0) { roots.push(min + i * step); continue; }
			if (y0 !== null && y0 * y1 < 0) {
				const r = bisect(F, min + (i - 1) * step, min + i * step);
				const fr = F(r);
				if (Number.isFinite(fr) && Math.abs(fr) <= Math.min(Math.abs(y0), Math.abs(y1))) roots.push(r);
			}
		}
		for (let i = 1; i < N; i++) {
			const a = ys[i - 1], b = ys[i], c = ys[i + 1];
			if (a === null || b === null || c === null || b === 0) continue;
			if (a * c > 0 && a * b > 0 && Math.abs(b) < Math.abs(a) && Math.abs(b) <= Math.abs(c)) {
				let lo = min + (i - 1) * step, hi = min + (i + 1) * step;
				for (let n = 0; n < 80; n++) {
					const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
					if (Math.abs(F(m1)) < Math.abs(F(m2))) hi = m2; else lo = m1;
				}
				const r = (lo + hi) / 2;
				if (Math.abs(F(r)) < 1e-9) roots.push(r);
			}
		}
		return uniqueRoots(roots);
	}

	function findRootsAuto(F) {
		const roots = [];
		for (const limit of [10, 100, 1000]) roots.push(...findRoots(F, -limit, limit));
		return uniqueRoots(roots);
	}

	const api = { parse, evaluate, formatNumber, findRoots, findRootsAuto, FUNCS };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();
