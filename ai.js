"use strict";

// AI(Gemini) 연동에서 네트워크와 무관한 부분: 프롬프트, 응답 해석, 식 검증, 오류 문구.
const Ai = (() => {
	const MAX_EQUATIONS = 4;
	const DEFAULT_MODEL = "gemini-3.8-flash";
	// 모델 목록에서 고를 때의 선호 순서 (무료 티어가 있는 Flash 계열).
	const PREFERRED_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
	const EXCLUDED_MODEL = /image|tts|live|audio|transcribe|translate|embedding|robotics|computer|veo|lyria|omni|gemma|learnlm/i;

	function buildSystemPrompt(unit) {
		return [
			"당신은 수학 문제를 '그래프 계산기 앱'에서 풀 수 있게 바꿔 주는 도우미입니다.",
			"반드시 아래 형식의 JSON 객체 하나만 출력하세요. 다른 문장이나 코드블록 표시는 쓰지 마세요.",
			"{",
			'  "title": "문제 한 줄 요약",',
			'  "equations": [ { "left": "식", "right": "식", "label": "무엇을 나타내는지" } ],',
			'  "answer": "최종 답 (한 줄)",',
			'  "steps": ["풀이 단계 1", "풀이 단계 2"],',
			'  "notes": "가정이나 주의할 점. 없으면 빈 문자열"',
			"}",
			"",
			"equations 작성 규칙 (앱이 그래프로 그리는 형식):",
			"- 변수는 x, y만 씁니다. 사용 가능한 함수: sin cos tan asin acos atan sinh cosh tanh sqrt cbrt log(상용로그) ln exp abs. 상수: pi, e. 거듭제곱은 ^, 곱셈은 * (2x처럼 생략 가능). 그 밖의 함수나 기호(floor, |x|, 팩토리얼 등)는 쓰지 마세요.",
			"- 방정식 하나(left = right)는 왼쪽 곡선과 오른쪽 곡선을 함께 그리고, 두 곡선이 만나는 점(= 방정식의 해)을 앱이 직접 계산해서 표시합니다.",
			'- 함수 y=f(x) 하나만 그릴 때: left="f(x)", right="0".',
			'- f(x)=g(x)를 풀거나 두 함수의 교점을 구할 때: left="f(x)", right="g(x)" (한 개의 방정식으로).',
			'- 원, 타원, 쌍곡선처럼 y가 들어가는 도형: left="x^2+y^2", right="25" 처럼 y를 포함해서 쓰고, right는 상수로 둡니다.',
			"- 곡선이 여러 개면 equations에 여러 개 넣되 최대 " + MAX_EQUATIONS + "개까지만 씁니다.",
			"- 매개변수가 필요한 문제는 a, b, c 같은 한 글자 변수를 쓰면 앱이 슬라이더를 만들어 줍니다 (x, y, e 제외).",
			"- 삼각형·사각형 같은 도형, 점·선분, 통계, 증명처럼 그래프로 그릴 수 없는 문제는 equations를 빈 배열로 두고 steps와 answer에 풀이만 쓰세요.",
			"- 삼각함수는 앱의 현재 각도 단위에 맞추세요. 현재 단위: " + (unit === "deg" ? "도(DEG)" : "라디안(RAD, pi 사용)") + ".",
			"",
			"steps는 3~8개의 짧은 한국어 문장, answer는 값만 간단히 씁니다. 확실하지 않으면 notes에 추측임을 밝히세요.",
		].join("\n");
	}

	// 모델이 코드블록이나 군더더기를 붙여도 JSON 객체만 꺼냅니다.
	function extractJson(text) {
		const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
		try { return JSON.parse(cleaned); } catch (error) { /* 아래에서 다시 시도 */ }
		const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
		if (start >= 0 && end > start) {
			try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (error) { /* 실패 */ }
		}
		throw new SyntaxError("AI 응답을 해석하지 못했어요. 다시 시도해 주세요.");
	}

	const str = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "");

	// 응답을 앱에서 안전하게 쓸 수 있는 형태로 정리합니다. parse는 Calc.parse.
	// 앱이 해석하지 못하는 식은 버리고 dropped 에 이유와 함께 남깁니다.
	function sanitizePlan(raw, parse) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("AI 응답 형식이 올바르지 않아요.");
		const equations = [];
		const dropped = [];
		for (const item of Array.isArray(raw.equations) ? raw.equations : []) {
			const left = str(item && item.left), right = str(item && item.right);
			const label = str(item && item.label).slice(0, 60);
			if (!left || !right) { dropped.push({ left, right, reason: "식이 비어 있어요" }); continue; }
			try {
				parse(left);
				parse(right);
			} catch (error) {
				dropped.push({ left, right, reason: error.message });
				continue;
			}
			if (equations.length < MAX_EQUATIONS) equations.push({ left: left.slice(0, 200), right: right.slice(0, 200), label });
		}
		return {
			title: str(raw.title).slice(0, 120),
			answer: str(raw.answer).slice(0, 400),
			steps: (Array.isArray(raw.steps) ? raw.steps : []).map(str).filter(Boolean).slice(0, 12),
			notes: str(raw.notes).slice(0, 400),
			equations,
			dropped,
		};
	}

	// 잠시 뒤 다시 하면 풀릴 수 있는 서버 쪽 오류인지 (500, 502, 503, 504)
	const isOverloadStatus = (status) => status === 500 || status === 502 || status === 503 || status === 504;

	// Gemini HTTP 오류를 사용자가 이해할 수 있는 문장으로 바꿉니다.
	function describeHttpError(status, data) {
		const detail = data && data.error && typeof data.error.message === "string" ? data.error.message : "";
		const reason = data && data.error && Array.isArray(data.error.details) ? (data.error.details.find((d) => d && d.reason) || {}).reason : "";
		if (reason === "API_KEY_INVALID" || (status === 400 && /api key/i.test(detail))) return "API 키가 올바르지 않아요. 'AI 설정'에서 다시 입력해 주세요.";
		if (status === 400) return "요청이 거부됐어요. " + detail.slice(0, 160);
		if (status === 401 || status === 403) return "이 키로는 사용할 수 없어요 (권한이나 지역 제한일 수 있어요). " + detail.slice(0, 120);
		if (status === 404) return "모델을 찾을 수 없어요. 'AI 설정'의 모델 이름을 확인해 주세요.";
		if (status === 429) return "무료 사용 한도를 넘었어요. 잠시 뒤에 다시 시도하거나 내일 이용해 주세요.";
		if (status >= 500) return "Google 서버가 바쁜 것 같아요 (" + status + "). 잠시 뒤에 다시 시도해 주세요." + (detail ? " [" + detail.slice(0, 100) + "]" : "");
		return "AI 호출에 실패했어요 (" + status + "). " + detail.slice(0, 120);
	}

	// models.list 응답(models 배열)에서 글 생성에 쓸 수 있는 Flash 모델을 고릅니다. 없으면 null.
	function listUsableModels(models) {
		const ids = [];
		for (const model of Array.isArray(models) ? models : []) {
			if (!model || typeof model !== "object") continue;
			const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
			const id = String(model.baseModelId || model.name || "").replace(/^models\//, "");
			if (!/^gemini-/.test(id) || EXCLUDED_MODEL.test(id) || !methods.includes("generateContent")) continue;
			if (!ids.includes(id)) ids.push(id);
		}
		return ids;
	}
	// 쓸 수 있는 Flash 모델을 선호 순서대로 나열합니다 (안정 버전 → 프리뷰 순).
	function orderModels(models) {
		const ids = listUsableModels(models);
		const ordered = PREFERRED_MODELS.filter((id) => ids.includes(id));
		for (const id of ids) if (/flash/.test(id) && !/preview/.test(id) && !ordered.includes(id)) ordered.push(id);
		for (const id of ids) if (/flash/.test(id) && !ordered.includes(id)) ordered.push(id);
		return ordered;
	}
	function pickModel(models) {
		return orderModels(models)[0] || null;
	}

	const api = { MAX_EQUATIONS, DEFAULT_MODEL, buildSystemPrompt, extractJson, sanitizePlan, describeHttpError, listUsableModels, orderModels, pickModel, isOverloadStatus };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	return api;
})();
