"use strict";

const CACHE = "scicalc-v3";
const ASSETS = ["./", "index.html", "style.css", "math.js", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

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

// 캐시를 먼저 보여주고, 뒤에서 새 버전을 받아 둡니다(오프라인에서도 동작).
self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;
	event.respondWith(
		caches.open(CACHE).then(async (cache) => {
			const hit = await cache.match(event.request);
			const network = fetch(event.request)
				.then((response) => {
					if (response.ok) cache.put(event.request, response.clone());
					return response;
				})
				.catch(() => hit);
			return hit || network;
		})
	);
});
