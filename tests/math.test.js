"use strict";

// 실행: node tests/math.test.js  (Node가 없으면 브라우저에서 tests/index.html 을 열어도 됩니다)
const engine = typeof require === "function" ? require("../math.js") : Calc;

const results = [];
function test(name, fn) {
	try { fn(); results.push([true, name]); } catch (error) { results.push([false, name + " -> " + error.message]); }
}
function eq(actual, expected, message) {
	if (actual !== expected) throw new Error((message || "") + " 기대 " + expected + ", 실제 " + actual);
}
function near(actual, expected, tolerance) {
	if (!(Math.abs(actual - expected) <= (tolerance || 1e-9))) throw new Error("기대 " + expected + ", 실제 " + actual);
}
function throws(fn) {
	let thrown = false;
	try { fn(); } catch (error) { thrown = true; }
	if (!thrown) throw new Error("예외가 발생해야 합니다");
}
const ev = (s, env) => engine.evaluate(s, Object.assign({ angle: 1 }, env));

test("사칙연산과 우선순위", () => { eq(ev("2+3*4"), 14); eq(ev("(2+3)*4"), 20); eq(ev("10/4"), 2.5); });
test("거듭제곱은 오른쪽 결합, 단항 마이너스는 더 낮음", () => { eq(ev("2^3^2"), 512); eq(ev("-2^2"), -4); eq(ev("2^-1"), 0.5); });
test("암묵적 곱셈", () => { eq(ev("2(3+4)"), 14); eq(ev("3x", { x: 2 }), 6); near(ev("2pi"), 2 * Math.PI); eq(ev("2x^2", { x: 3 }), 18); eq(ev("xsin(x)", { x: 0 }), 0); });
test("함수", () => { eq(ev("sqrt(16)"), 4); near(ev("log(1000)"), 3); near(ev("ln(e)"), 1); eq(ev("abs(-5)"), 5); near(ev("sin(pi/2)"), 1); });
test("각도 단위(DEG)", () => { near(ev("sin(90)", { angle: Math.PI / 180 }), 1); near(ev("acos(0)", { angle: Math.PI / 180 }), 90); });
test("변수 k 는 각도 단위와 충돌하지 않음 (sin(kx))", () => {
	near(ev("sin(kx)", { k: 2, x: Math.PI / 4 }), 1);
	near(ev("sin(kx)", { k: 2, x: 45, angle: Math.PI / 180 }), 1);
	eq(ev("sin(kx)", { k: 0, x: 3 }), 0);
});
test("한글 키패드 기호", () => { eq(ev("6×7"), 42); eq(ev("8÷2"), 4); eq(ev("5−3"), 2); eq(ev("√(9)"), 3); });
test("잘못된 식은 예외", () => { throws(() => ev("2+")); throws(() => ev("2 3")); throws(() => ev("(1+2")); throws(() => ev("")); throws(() => ev("2$3")); });
test("정의되지 않은 변수는 예외", () => { throws(() => ev("a+1")); });
test("0으로 나누기는 예외", () => { throws(() => ev("1/0")); });
test("숫자 표시 형식", () => { eq(engine.formatNumber(0.1 + 0.2), "0.3"); eq(engine.formatNumber(5), "5"); eq(engine.formatNumber(Math.sin(Math.PI)), "0"); eq(engine.formatNumber(1 / 3), "0.3333333333"); });

function solver(left, right, extra) {
	const l = engine.parse(left), r = engine.parse(right);
	const env = Object.assign({ x: 0, angle: 1 }, extra);
	return (x) => { env.x = x; return l.fn(env) - r.fn(env); };
}
test("해 찾기: 이차방정식", () => {
	const roots = engine.findRoots(solver("x^2", "4"), -10, 10);
	eq(roots.length, 2); near(roots[0], -2, 1e-8); near(roots[1], 2, 1e-8);
});
test("해 찾기: sin(x)=0.5 는 [-10,10]에 7개", () => { eq(engine.findRoots(solver("sin(x)", "0.5"), -10, 10).length, 7); });
test("해 찾기: 접하는 중근 x^2=0", () => {
	const roots = engine.findRoots(solver("x^2", "0"), -10, 10);
	eq(roots.length, 1); near(roots[0], 0, 1e-6);
});
test("해 찾기: 점근선 1/x=0 은 해가 없음", () => { eq(engine.findRoots(solver("1/x", "0"), -10, 10).length, 0); });
test("해 찾기: 변수 포함 a*x=6", () => { near(engine.findRoots(solver("a*x", "6", { a: 3 }), -10, 10)[0], 2, 1e-8); });
test("해 찾기: 자동 범위는 큰 해도 찾음", () => { eq(engine.findRootsAuto(solver("x", "500")).length, 1); });

const polyOf = (src, env) => engine.parse(src).poly(Object.assign({ angle: 1 }, env));
const polyRoots = (left, right, env) => engine.polyRealRoots(engine.polySub(polyOf(left, env), polyOf(right, env)));
test("다항식 판별: 계수로 변환", () => {
	eq(JSON.stringify(polyOf("x^2-4")), "[-4,0,1]");
	eq(JSON.stringify(polyOf("(x+1)^3")), "[1,3,3,1]");
	eq(JSON.stringify(polyOf("x/2+1")), "[1,0.5]");
	eq(JSON.stringify(polyOf("a*x^2+b", { a: 2, b: 3 })), "[3,0,2]");
	eq(JSON.stringify(polyOf("2x^2-x")), "[0,-1,2]");
});
test("다항식 판별: 다항식이 아닌 식은 null", () => {
	eq(polyOf("sin(x)"), null); eq(polyOf("1/x"), null); eq(polyOf("x^0.5"), null); eq(polyOf("2^x"), null); eq(polyOf("abs(x)"), null);
});
test("다항식 판별: 상수 함수 호출은 허용", () => { eq(JSON.stringify(polyOf("sqrt(4)*x")), "[0,2]"); });
test("다항식 해: 삼차 x^3-2x-5 (구간 없이 하나)", () => {
	const roots = polyRoots("x^3-2*x", "5");
	eq(roots.length, 1); near(roots[0], 2.0945514815423265, 1e-9);
});
test("다항식 해: (x-1)(x-2)(x-3) 전개형", () => {
	const roots = polyRoots("x^3-6x^2+11x", "6");
	eq(roots.length, 3); near(roots[0], 1, 1e-9); near(roots[1], 2, 1e-9); near(roots[2], 3, 1e-9);
});
test("다항식 해: 사차 x^4-5x^2+4 는 4개", () => {
	const roots = polyRoots("x^4-5x^2+4", "0");
	eq(roots.length, 4); near(roots[0], -2, 1e-9); near(roots[1], -1, 1e-9); near(roots[2], 1, 1e-9); near(roots[3], 2, 1e-9);
});
test("다항식 해: 중근 (x-1)^2 와 삼중근 (x-2)^3", () => {
	const double = polyRoots("(x-1)^2", "0"); eq(double.length, 1); near(double[0], 1, 1e-6);
	const triple = polyRoots("(x-2)^3", "0"); eq(triple.length, 1); near(triple[0], 2, 1e-3);
});
test("다항식 해: 실수 해가 없는 x^2+1", () => { eq(polyRoots("x^2+1", "0").length, 0); });
test("다항식 해: 아주 큰 해도 구간 없이 찾음", () => { near(polyRoots("x", "123456")[0], 123456, 1e-6); near(polyRoots("x^2", "10000000000")[1], 100000, 1e-3); });
test("다항식 해: 변수 포함 a*x^2 = 8", () => {
	const roots = polyRoots("a*x^2", "8", { a: 2 });
	eq(roots.length, 2); near(roots[0], -2, 1e-9); near(roots[1], 2, 1e-9);
});

test("π 표기: 간단한 분수는 π로, 아니면 null", () => {
	const P = Math.PI;
	eq(engine.formatPi(P / 6), "π/6"); eq(engine.formatPi(5 * P / 6), "5π/6"); eq(engine.formatPi(-P / 2), "-π/2");
	eq(engine.formatPi(2 * P), "2π"); eq(engine.formatPi(P), "π"); eq(engine.formatPi(0), "0"); eq(engine.formatPi(5 * P / 24), "5π/24");
	eq(engine.formatPi(0.5), null); eq(engine.formatPi(2), null); eq(engine.formatPi(P + 0.001), null);
});
test("π 표기: sin(x)=0.5 의 해가 π/6, 5π/6 …", () => {
	const roots = engine.findRoots(solver("sin(x)", "0.5"), 0, 7);
	eq(roots.map((r) => engine.formatPi(r)).join(","), "π/6,5π/6,13π/6");
});

const ai = typeof require === "function" ? require("../ai.js") : Ai;
test("AI 응답: 코드블록과 군더더기가 있어도 JSON을 꺼냄", () => {
	eq(ai.extractJson('{"a":1}').a, 1);
	eq(ai.extractJson('```json\n{"a":2}\n```').a, 2);
	eq(ai.extractJson('결과입니다: {"a":3} 끝').a, 3);
	throws(() => ai.extractJson("JSON이 아님"));
});
test("AI 응답: 올바른 식은 통과, 모르는 식은 제외", () => {
	const plan = ai.sanitizePlan({
		title: "교점", answer: "x=1, 2", steps: ["a", "b", ""], notes: "",
		equations: [{ left: "x^2-4x+3", right: "x-1", label: "포물선과 직선" }, { left: "floor(x", right: "0" }, { left: "", right: "1" }],
	}, engine.parse);
	eq(plan.equations.length, 1); eq(plan.dropped.length, 2); eq(plan.steps.length, 2); eq(plan.equations[0].label, "포물선과 직선");
});
test("AI 응답: 오른쪽이 숫자(0)여도 받아들임", () => {
	const plan = ai.sanitizePlan({ equations: [{ left: "x^2-4", right: 0 }] }, engine.parse);
	eq(plan.equations.length, 1); eq(plan.equations[0].right, "0");
});
test("AI 응답: 식은 최대 4개, 배열이 아니거나 비어도 안전", () => {
	const many = Array.from({ length: 9 }, (_, i) => ({ left: "x+" + i, right: "0" }));
	eq(ai.sanitizePlan({ equations: many }, engine.parse).equations.length, 4);
	eq(ai.sanitizePlan({ equations: "없음", steps: "없음" }, engine.parse).equations.length, 0);
	throws(() => ai.sanitizePlan(null, engine.parse)); throws(() => ai.sanitizePlan([], engine.parse));
});
test("AI 오류 문구", () => {
	const bad = { error: { message: "API key not valid.", details: [{ reason: "API_KEY_INVALID" }] } };
	eq(ai.describeHttpError(400, bad).includes("API 키"), true);
	eq(ai.describeHttpError(429, null).includes("한도"), true);
	eq(ai.describeHttpError(404, null).includes("모델"), true);
	eq(ai.describeHttpError(503, null).includes("서버"), true);
});
const modelEntry = (name, methods) => ({ name: "models/" + name, supportedGenerationMethods: methods || ["generateContent"] });
test("AI 모델 선택: 선호 순서대로, 생성 불가·이미지·음성 모델은 제외", () => {
	const models = [
		modelEntry("gemini-2.5-flash"), modelEntry("gemini-3.6-flash"), modelEntry("gemini-3.8-flash-tts"),
		modelEntry("gemini-3.8-flash-image"), modelEntry("gemini-3.8-flash", ["countTokens"]), modelEntry("text-embedding-004", ["embedContent"]),
	];
	eq(ai.pickModel(models), "gemini-3.6-flash");
	eq(ai.listUsableModels(models).join(","), "gemini-2.5-flash,gemini-3.6-flash");
});
test("AI 모델 선택: 선호 목록에 없으면 다른 Flash, 없으면 null", () => {
	eq(ai.pickModel([modelEntry("gemini-9-flash"), modelEntry("gemini-9-flash-preview")]), "gemini-9-flash");
	eq(ai.pickModel([modelEntry("gemini-9-flash-preview")]), "gemini-9-flash-preview");
	eq(ai.pickModel([modelEntry("gemini-9-pro")]), null);
	eq(ai.pickModel([]), null); eq(ai.pickModel(null), null); eq(ai.pickModel([null, 3, {}]), null);
});
test("AI 모델 순서: 선호 순서 → 다른 안정 Flash → 프리뷰", () => {
	const models = [modelEntry("gemini-3-flash-preview"), modelEntry("gemini-9-flash"), modelEntry("gemini-3.6-flash"), modelEntry("gemini-3.8-flash"), modelEntry("gemini-9-pro")];
	eq(ai.orderModels(models).join(","), "gemini-3.8-flash,gemini-3.6-flash,gemini-9-flash,gemini-3-flash-preview");
});
test("AI 서버 바쁨 판별과 오류 문구에 상태 코드·원인 포함", () => {
	eq(ai.isOverloadStatus(503) && ai.isOverloadStatus(500) && ai.isOverloadStatus(504), true);
	eq(ai.isOverloadStatus(429) || ai.isOverloadStatus(404) || ai.isOverloadStatus(400), false);
	const message = ai.describeHttpError(503, { error: { message: "The model is overloaded. Please try again later." } });
	eq(message.includes("503") && message.includes("overloaded"), true);
});
test("AI 기본 모델은 gemini-3.8-flash", () => { eq(ai.DEFAULT_MODEL, "gemini-3.8-flash"); });
test("AI 프롬프트: 각도 단위와 최대 식 개수 반영", () => {
	eq(ai.buildSystemPrompt("deg").includes("도(DEG)"), true);
	eq(ai.buildSystemPrompt("rad").includes("라디안"), true);
	eq(ai.buildSystemPrompt("rad").includes("최대 4개"), true);
});

const failed = results.filter((r) => !r[0]);
const summary = results.map((r) => (r[0] ? "PASS " : "FAIL ") + r[1]).join("\n") + "\n" + (results.length - failed.length) + "/" + results.length + " 통과";
if (typeof document !== "undefined") {
	const pre = document.createElement("pre");
	pre.id = "result";
	pre.textContent = summary;
	document.body.append(pre);
} else {
	console.log(summary);
	if (failed.length) process.exitCode = 1;
}
