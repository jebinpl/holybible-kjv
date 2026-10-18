/* =====================================================
   HOLY BIBLE KJV - SERVICE WORKER
   Offline support for app shell, Bible JSON,
   Daily Promise, backgrounds, and fonts
===================================================== */

const CACHE_NAME = "holy-bible-v118";

/* =====================================================
   APP FILES
===================================================== */

const APP_FILES = [
    "./",
    "./index.html",
    "./logo.png",
    "./manifest.json",
    "./daily-promises.json",

    // Galilee home backgrounds
    "./images/galilee-background.png",
    "./images/galilee-background-2.png",
    "./images/galilee-background-3.png",

    // Fonts
    "./fonts/NotoSans-Regular.ttf",
    "./fonts/NotoSansTamil-Regular.ttf",
    "./fonts/NotoSansMalayalam-Regular.ttf",
    "./fonts/NotoSansDevanagari-Regular.ttf"
];

/* =====================================================
   BIBLE BOOKS
===================================================== */

const BIBLE_BOOKS = [
    "Genesis",
    "Exodus",
    "Leviticus",
    "Numbers",
    "Deuteronomy",
    "Joshua",
    "Judges",
    "Ruth",
    "1 Samuel",
    "2 Samuel",
    "1 Kings",
    "2 Kings",
    "1 Chronicles",
    "2 Chronicles",
    "Ezra",
    "Nehemiah",
    "Esther",
    "Job",
    "Psalms",
    "Proverbs",
    "Ecclesiastes",
    "Song of Solomon",
    "Isaiah",
    "Jeremiah",
    "Lamentations",
    "Ezekiel",
    "Daniel",
    "Hosea",
    "Joel",
    "Amos",
    "Obadiah",
    "Jonah",
    "Micah",
    "Nahum",
    "Habakkuk",
    "Zephaniah",
    "Haggai",
    "Zechariah",
    "Malachi",
    "Matthew",
    "Mark",
    "Luke",
    "John",
    "Acts",
    "Romans",
    "1 Corinthians",
    "2 Corinthians",
    "Galatians",
    "Ephesians",
    "Philippians",
    "Colossians",
    "1 Thessalonians",
    "2 Thessalonians",
    "1 Timothy",
    "2 Timothy",
    "Titus",
    "Philemon",
    "Hebrews",
    "James",
    "1 Peter",
    "2 Peter",
    "1 John",
    "2 John",
    "3 John",
    "Jude",
    "Revelation"
];

/* =====================================================
   BIBLE LANGUAGE FOLDERS
===================================================== */

const BIBLE_LANGUAGES = [
    "bible-en",
    "bible-ta",
    "bible-ml",
    "bible-hi"
];

/* =====================================================
   GENERATE ALL BIBLE JSON PATHS
===================================================== */

const BIBLE_FILES = [];

BIBLE_LANGUAGES.forEach(function (language) {

    BIBLE_BOOKS.forEach(function (book) {

        BIBLE_FILES.push(
            "./bible/" +
            language +
            "/" +
            encodeURIComponent(book) +
            ".json"
        );

    });

});

/* =====================================================
   INSTALL SERVICE WORKER
===================================================== */

self.addEventListener("install", function (event) {

    event.waitUntil(

        (async function () {

            const cache = await caches.open(CACHE_NAME);

            const allFiles = [
                ...APP_FILES,
                ...BIBLE_FILES
            ];

            /* Cache files individually.
               A missing file will not stop the
               remaining files from being cached. */

            await Promise.allSettled(

                allFiles.map(async function (file) {

                    try {

                        const response = await fetch(
                            file,
                            { cache: "reload" }
                        );

                        if (response.ok) {

                            await cache.put(
                                file,
                                response
                            );

                        } else {

                            console.warn(
                                "Offline cache skipped:",
                                file,
                                response.status
                            );

                        }

                    } catch (error) {

                        console.warn(
                            "Could not cache:",
                            file,
                            error
                        );

                    }

                })

            );

            await self.skipWaiting();

        })()

    );

});

/* =====================================================
   ACTIVATE SERVICE WORKER
===================================================== */

self.addEventListener("activate", function (event) {

    event.waitUntil(

        (async function () {

            const cacheNames = await caches.keys();

            await Promise.all(

                cacheNames.map(function (cacheName) {

                    if (
                        cacheName.startsWith("holy-bible-") &&
                        cacheName !== CACHE_NAME
                    ) {

                        return caches.delete(cacheName);

                    }

                })

            );

            await self.clients.claim();

        })()

    );

});

/* =====================================================
   FETCH HANDLER
===================================================== */

self.addEventListener("fetch", function (event) {

    const request = event.request;

    // Only handle GET requests.
    if (request.method !== "GET") {
        return;
    }

    const requestURL = new URL(request.url);

    /* =================================================
       EXTERNAL RESOURCES
       YouTube and external PDF libraries
    ================================================= */

    if (requestURL.origin !== self.location.origin) {

        event.respondWith(

            (async function () {

                const cache = await caches.open(CACHE_NAME);

                try {

                    const response = await fetch(request);

                    if (response && response.ok) {

                        try {
                            await cache.put(
                                request,
                                response.clone()
                            );
                        } catch (error) {
                            // Some external responses cannot be cached.
                        }

                    }

                    return response;

                } catch (error) {

                    const cachedResponse = await cache.match(request);

                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    return new Response(
                        "This resource is unavailable offline.",
                        {
                            status: 503,
                            statusText: "Offline"
                        }
                    );

                }

            })()

        );

        return;
    }

    
    /* =================================================
       INTRO MUSIC
       Network first; preserve media Range requests
    ================================================= */

    
if (
    requestURL.origin === self.location.origin &&
    /\/songs\/.*\.mp3$/i.test(requestURL.pathname)
) {


        event.respondWith(

            (async function () {

                try {

                    // Request the song directly from GitHub Pages.
                    // Preserve the original request, including Range headers.
                    return await fetch(request);

                } catch (error) {

                    // If offline, try a previously cached full song.
                    if (!request.headers.has("Range")) {

                        const cache = await caches.open(CACHE_NAME);
                        const cachedResponse = await cache.match(request);

                        if (cachedResponse) {
                            return cachedResponse;
                        }

                    }

                    return new Response(
                        "Intro music is unavailable. Please check your connection and try again.",
                        {
                            status: 503,
                            statusText: "Music Unavailable",
                            headers: {
                                "Content-Type": "text/plain; charset=utf-8"
                            }
                        }
                    );

                }

            })()

        );

        return;
    }


    /* =================================================
       SAME-ORIGIN RESOURCES
       Cache first, then network
    ================================================= */

    event.respondWith(

        (async function () {

            const cache = await caches.open(CACHE_NAME);

            /* Try the cache first. */

            const cachedResponse = await cache.match(
                request,
                { ignoreSearch: true }
            );

            if (cachedResponse) {
                return cachedResponse;
            }

            /* If not cached, try the network. */

            try {

                const response = await fetch(request);

                if (response && response.ok) {

                    await cache.put(
                        request,
                        response.clone()
                    );

                }

                return response;

            } catch (error) {

                /* If offline, return the cached app shell
                   for navigation requests. */

                if (request.mode === "navigate") {

                    const cachedIndex = await cache.match(
                        "./index.html"
                    );

                    if (cachedIndex) {
                        return cachedIndex;
                    }

                }

                /* Return a clear offline response if
                   the requested file is not cached. */

                return new Response(
                    "This file is not available offline. Please open the app online once to cache it.",
                    {
                        status: 503,
                        statusText: "Offline",
                        headers: {
                            "Content-Type": "text/plain; charset=utf-8"
                        }
                    }
                );

            }

        })()

    );

});
