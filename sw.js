
/* =====================================================
   HOLY BIBLE KJV - SERVICE WORKER
   Offline support for app shell, Bible JSON,
   Daily Promise, backgrounds, and fonts
===================================================== */

const CACHE_NAME = "holy-bible-v127";

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

            /*
             Cache files individually.
             A missing file will not stop the
             remaining files from being cached.
            */

            await Promise.allSettled(
                allFiles.map(async function (file) {
                    try {
                        const response = await fetch(
                            file,
                            { cache: "reload" }
                        );

                        if (response.ok) {
                            await cache.put(file, response);
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

            /*
             Keep old music caches until index.html safely
             migrates their song responses and playlist
             membership into the shared music cache.
            */

            await Promise.all(
                cacheNames.map(function (cacheName) {
                    if (
                        cacheName.startsWith("holy-bible-") &&
                        cacheName !== CACHE_NAME &&
                        !cacheName.startsWith("holy-bible-music-")
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
   MUSIC CACHE COORDINATOR

   Cache replacements first. Only after every download
   succeeds are old songs removed.
===================================================== */

self.addEventListener("message", function (event) {
    const data = event.data;

    if (!data || data.type !== "MUSIC_CACHE_SYNC") {
        return;
    }

    const task = (async function () {
        // All playlists share one physical MP3 cache.
        const cache = await caches.open(
            "holy-bible-music-shared-v1"
        );

        const urlsToCache = Array.isArray(data.urlsToCache)
            ? data.urlsToCache
            : [];

        const urlsToRemove = Array.isArray(data.urlsToRemove)
            ? data.urlsToRemove
            : [];

        /*
         Finish every required download before deleting
         any cached song.
        */

        for (const item of urlsToCache) {
            const url = new URL(
                item,
                self.location.href
            ).href;

            if (await cache.match(url)) {
                continue;
            }

            const response = await fetch(url, {
                cache: "no-store"
            });

            if (!response.ok || response.status !== 200) {
                throw new Error(
                    "Song download failed: " + url
                );
            }

            await cache.put(url, response.clone());
        }

        // Remove songs only after all downloads succeed.
        for (const item of urlsToRemove) {
            const url = new URL(
                item,
                self.location.href
            ).href;

            await cache.delete(url);
        }

        return { success: true };
    })();

    event.waitUntil(
        task.then(function (result) {
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage(result);
            }
        }).catch(function (error) {
            console.warn(
                "Music cache sync failed:",
                error
            );

            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({
                    success: false,
                    error: error.message
                });
            }
        })
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
                    const cachedResponse = await cache.match(
                        request
                    );

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
       BUILT-IN MUSIC

       Network first; uncached songs stream online.
       Cached MP3 files play offline.
       Preserve byte-range playback for media players.
    ================================================= */

    if (
        requestURL.origin === self.location.origin &&
        /\/songs\/.*\.mp3$/i.test(requestURL.pathname)
    ) {
        event.respondWith(
            (async function () {
                const rangeHeader = request.headers.get("Range");

                try {
                    /*
                     Stream uncached songs online without
                     automatically caching them.
                     The playlist coordinator downloads
                     replacements to maintain cache limits.
                    */

                    const response = await fetch(request);
                    return response;
                } catch (error) {
                    let cached = null;

                    const sharedCache = await caches.open(
                        "holy-bible-music-shared-v1"
                    );

                    cached = await sharedCache.match(
                        request.url
                    );

                    /*
                     Fallback to old music caches while
                     index.html migrates existing songs.
                    */

                    if (!cached) {
                        const musicCacheNames = (
                            await caches.keys()
                        ).filter(function (name) {
                            return (
                                name.startsWith("holy-bible-music-") &&
                                name !== "holy-bible-music-shared-v1"
                            );
                        });

                        for (const name of musicCacheNames) {
                            const musicCache = await caches.open(name);

                            cached = await musicCache.match(
                                request.url
                            );

                            if (cached) {
                                break;
                            }
                        }
                    }

                    if (!cached) {
                        return new Response(
                            "This song is not available offline.",
                            {
                                status: 503,
                                statusText: "Music Unavailable",
                                headers: {
                                    "Content-Type":
                                        "text/plain; charset=utf-8"
                                }
                            }
                        );
                    }

                    /*
                     A cached full response can satisfy
                     a single byte-range request.
                    */

                    if (rangeHeader) {
                        const match = /^bytes=(\d*)-(\d*)$/i.exec(
                            rangeHeader.trim()
                        );

                        if (!match) {
                            return new Response(null, {
                                status: 416,
                                statusText: "Range Not Satisfiable"
                            });
                        }

                        const fullBuffer = await cached.arrayBuffer();
                        const size = fullBuffer.byteLength;

                        let startByte = match[1]
                            ? Number(match[1])
                            : null;

                        let endByte = match[2]
                            ? Number(match[2])
                            : null;

                        if (
                            startByte === null &&
                            endByte !== null
                        ) {
                            startByte = Math.max(
                                0,
                                size - endByte
                            );

                            endByte = size - 1;
                        } else {
                            if (startByte === null) {
                                startByte = 0;
                            }

                            if (
                                endByte === null ||
                                endByte >= size
                            ) {
                                endByte = size - 1;
                            }
                        }

                        if (
                            startByte < 0 ||
                            startByte >= size ||
                            endByte < startByte
                        ) {
                            return new Response(null, {
                                status: 416,
                                statusText: "Range Not Satisfiable",
                                headers: {
                                    "Content-Range": "bytes */" + size
                                }
                            });
                        }

                        const body = fullBuffer.slice(
                            startByte,
                            endByte + 1
                        );

                        const headers = new Headers(
                            cached.headers
                        );

                        headers.set("Accept-Ranges", "bytes");

                        headers.set(
                            "Content-Range",
                            "bytes " +
                            startByte +
                            "-" +
                            endByte +
                            "/" +
                            size
                        );

                        headers.set(
                            "Content-Length",
                            String(body.byteLength)
                        );

                        return new Response(body, {
                            status: 206,
                            statusText: "Partial Content",
                            headers: headers
                        });
                    }

                    return cached;
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
                /*
                 If offline, return the cached app shell
                 for navigation requests.
                */

                if (request.mode === "navigate") {
                    const cachedIndex = await cache.match(
                        "./index.html"
                    );

                    if (cachedIndex) {
                        return cachedIndex;
                    }
                }

                /*
                 Return a clear offline response if
                 the requested file is not cached.
                */

                return new Response(
                    "This file is not available offline. " +
                    "Please open the app online once to cache it.",
                    {
                        status: 503,
                        statusText: "Offline",
                        headers: {
                            "Content-Type":
                                "text/plain; charset=utf-8"
                        }
                    }
                );
            }
        })()
    );
});
