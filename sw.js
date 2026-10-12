"use strict";

const CACHE = "scicalc-v11";
const ASSETS = ["./", "index.html", "style.css", "math.js", "ai.js", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error("timeout")), ms);
	promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

// 인터넷이 되면 항상 최신 파일을 받고(브라우저 HTTP 캐시도 재확인), 오프라인이거나 너무 느릴 때만 저장된 파일을 씁니다.
// (예전처럼 캐시를 먼저 보여주면 업데이트가 한두 번 늦게 반영돼서 옛 화면이 보였습니다.)
async function networkFirst(request) {
	const cache = await caches.open(CACHE);
	try {
		const response = await withTimeout(fetch(request, { cache: "no-cache" }), NETWORK_TIMEOUT_MS);
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch (error) {
		const hit = await cache.match(request);
		if (hit) return hit;
		throw error;
	}
}

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;
	if (new URL(event.request.url).origin !== self.location.origin) return;
	event.respondWith(networkFirst(event.request));
});
