"use strict";

const APP_SCOPE = self.registration.scope;
const SCOPE_PATH = new URL(APP_SCOPE).pathname;
const CACHE_PREFIX = `workout-local-${encodeURIComponent(SCOPE_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL = [
	"./",
	"./index.html",
	"./style.css",
	"./app.js",
	"./exercises.js",
	"./manifest.webmanifest",
	"./icon.svg",
	"./icon-180.png",
	"./icon-192.png",
	"./icon-512.png"
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then((cache) => cache.addAll(APP_SHELL.map((path) => new URL(path, APP_SCOPE).href)))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((cacheNames) => Promise.all(
				cacheNames
					.filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
					.map((cacheName) => caches.delete(cacheName))
			))
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const requestUrl = new URL(request.url);
	if (request.method !== "GET" || requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(SCOPE_PATH)) return;

	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request).catch(async () => {
				const cache = await caches.open(CACHE_NAME);
				return (await cache.match(request)) || cache.match(new URL("./index.html", APP_SCOPE));
			})
		);
		return;
	}

	event.respondWith(
		caches.open(CACHE_NAME).then(async (cache) => {
			const cachedResponse = await cache.match(request);
			if (cachedResponse) return cachedResponse;

			const response = await fetch(request);
			if (response.ok) await cache.put(request, response.clone());
			return response;
		})
	);
});