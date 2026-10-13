/* =========================================================
   Bible Search Web Worker
   - Hash-based inverted index: word -> verse IDs
   - Prefix index: word prefix -> matching vocabulary
   - Exact whole-word search first; prefix fallback second
========================================================= */

let verses = [];
let wordIndex = new Map();
let prefixIndex = new Map();
let currentResultIds = [];
let currentRequestId = 0;
let initialized = false;

function tokenize(text) {
    return String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

function addPosting(index, key, verseId) {
    let posting = index.get(key);
    if (!posting) {
        posting = [];
        index.set(key, posting);
    }
    posting.push(verseId);
}

function intersectSortedLists(lists) {
    if (!lists.length) return [];

    lists.sort(function(a, b) {
        return a.length - b.length;
    });

    let result = lists[0];

    for (let i = 1; i < lists.length && result.length; i++) {
        const next = lists[i];
        const intersection = [];
        let a = 0;
        let b = 0;

        while (a < result.length && b < next.length) {
            if (result[a] === next[b]) {
                intersection.push(result[a]);
                a++;
                b++;
            } else if (result[a] < next[b]) {
                a++;
            } else {
                b++;
            }
        }

        result = intersection;
    }

    return result;
}

function unionPostingLists(tokenList) {
    const ids = new Set();

    for (const token of tokenList) {
        const posting = wordIndex.get(token);
        if (!posting) continue;

        for (const id of posting) {
            ids.add(id);
        }
    }

    return Array.from(ids).sort(function(a, b) {
        return a - b;
    });
}

function exactSearchIds(words) {
    const lists = [];

    for (const word of words) {
        const posting = wordIndex.get(word);
        if (!posting) return [];
        lists.push(posting);
    }

    return intersectSortedLists(lists);
}

function prefixSearchIds(words) {
    const lists = [];

    for (const prefix of words) {
        const candidates = prefixIndex.get(prefix);

        if (!candidates || !candidates.length) {
            return [];
        }

        lists.push(unionPostingLists(candidates));
    }

    return intersectSortedLists(lists);
}

function pageResults(requestId, offset, pageSize) {
    const safeOffset = Math.max(0, Number(offset) || 0);
    const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 100));

    const ids = currentResultIds.slice(safeOffset, safeOffset + safePageSize);

    self.postMessage({
        type: "results",
        requestId: requestId,
        offset: safeOffset,
        total: currentResultIds.length,
        results: ids.map(function(id) {
            return verses[id];
        })
    });
}

async function initialize(books) {
    try {
        verses = [];
        wordIndex = new Map();
        prefixIndex = new Map();

        // Fetch in parallel; the browser manages connection concurrency.
        const bookData = await Promise.all(books.map(async function(bookName, index) {
            const url = new URL(
                "bible/bible-en/" + encodeURIComponent(bookName) + ".json",
                self.location.href
            );

            const response = await fetch(url.href);

            if (!response.ok) {
                throw new Error(
                    "Could not load " + bookName + " (" + response.status + ")"
                );
            }

            const data = await response.json();
            self.postMessage({
                type: "progress",
                loaded: index + 1,
                total: books.length
            });

            return { bookName: bookName, data: data };
        }));

        // Preserve Bible book order, then numeric chapter/verse order.
        for (const entry of bookData) {
            const chapters = entry.data && entry.data.chapters;
            if (!chapters) continue;

            const chapterNames = Object.keys(chapters).filter(function(key) {
                return /^\d+$/.test(key);
            }).sort(function(a, b) {
                return Number(a) - Number(b);
            });

            for (const chapter of chapterNames) {
                const chapterVerses = chapters[chapter];

                const verseNumbers = Object.keys(chapterVerses).filter(function(key) {
                    return /^\d+$/.test(key) && chapterVerses[key];
                }).sort(function(a, b) {
                    return Number(a) - Number(b);
                });

                for (const verseNumber of verseNumbers) {
                    const verseId = verses.length;

                    verses.push({
                        book: entry.bookName,
                        chapter: chapter,
                        verse: verseNumber,
                        text: String(chapterVerses[verseNumber])
                    });

                    // One posting per unique word per verse.
                    const uniqueWords = new Set(tokenize(chapterVerses[verseNumber]));

                    for (const word of uniqueWords) {
                        addPosting(wordIndex, word, verseId);
                    }
                }
            }
        }

        // Build prefix lookup from the vocabulary, not from every verse.
        for (const word of wordIndex.keys()) {
            for (let length = 2; length <= word.length; length++) {
                const prefix = word.slice(0, length);
                let tokens = prefixIndex.get(prefix);

                if (!tokens) {
                    tokens = [];
                    prefixIndex.set(prefix, tokens);
                }

                tokens.push(word);
            }
        }

        initialized = true;

        self.postMessage({
            type: "ready",
            verseCount: verses.length,
            wordCount: wordIndex.size,
            prefixCount: prefixIndex.size
        });

    } catch (error) {
        self.postMessage({
            type: "initError",
            message: error && error.message ? error.message : String(error)
        });
    }
}

self.onmessage = function(event) {
    const data = event.data || {};

    if (data.type === "init") {
        if (!initialized) {
            initialize(Array.isArray(data.books) ? data.books : []);
        }
        return;
    }

    if (!initialized) {
        if (data.type === "search") {
            self.postMessage({
                type: "searchError",
                requestId: data.requestId,
                message: "Search index is not ready."
            });
        }
        return;
    }

    if (data.type === "search") {
        const requestId = data.requestId;
        currentRequestId = requestId;

        const words = Array.from(new Set(tokenize(data.query)));

        if (!words.length) {
            currentResultIds = [];
            pageResults(requestId, 0, data.pageSize);
            return;
        }

        let ids = exactSearchIds(words);

        // Preserve the app's behavior: only use prefix matches if there
        // are no exact whole-word matches for the complete query.
        if (!ids.length) {
            ids = prefixSearchIds(words);
        }

        // Ignore a query if a newer one has already arrived.
        if (requestId !== currentRequestId) return;

        currentResultIds = ids;
        pageResults(requestId, 0, data.pageSize);
        return;
    }

    if (data.type === "more") {
        if (data.requestId !== currentRequestId) return;
        pageResults(data.requestId, data.offset, data.pageSize);
    }
};
