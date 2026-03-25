import { fetchEntries, searchEntries } from "../api.js";
import { renderEntryCard } from "../components/entryCard.js";
import { escapeHtml } from "../utils.js";

export async function renderFeed(container) {
    // Parse optional tag filter from URL hash e.g. #/feed?tag=travel
    const hashQuery = window.location.hash.includes("?")
        ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
        : "";
    const urlParams = new URLSearchParams(hashQuery);
    const initialTag = urlParams.get("tag") || "";

    container.innerHTML = `
        <div class="feed-container">
            <h2 class="feed-header">My Journal</h2>
            <div class="feed-filters">
                <input
                    type="search"
                    id="feed-search"
                    class="feed-search-input"
                    placeholder="Search entries…"
                    autocomplete="off"
                >
                <div class="feed-date-filters">
                    <label class="feed-date-label">From <input type="date" id="feed-date-from" class="feed-date-input"></label>
                    <label class="feed-date-label">To <input type="date" id="feed-date-to" class="feed-date-input"></label>
                    <button class="btn btn-small btn-ghost" id="feed-clear-filters" style="display:none">Clear filters</button>
                </div>
            </div>
            <div class="feed-entries" id="feed-entries">
                ${skeletonCards(3)}
            </div>
            <div class="load-more-container hidden" id="feed-load-more">
                <button class="btn btn-secondary">Load more</button>
            </div>
        </div>
    `;

    let currentPage = 1;
    const pageSize = 20;
    let currentQuery = "";
    let currentDateFrom = "";
    let currentDateTo = "";
    let currentTag = initialTag;

    const entriesEl = document.getElementById("feed-entries");
    const loadMoreEl = document.getElementById("feed-load-more");
    const searchInput = document.getElementById("feed-search");
    const dateFromInput = document.getElementById("feed-date-from");
    const dateToInput = document.getElementById("feed-date-to");
    const clearBtn = document.getElementById("feed-clear-filters");

    function updateClearButton() {
        const hasFilters = currentQuery.trim() || currentDateFrom || currentDateTo || currentTag;
        clearBtn.style.display = hasFilters ? "inline-block" : "none";
    }

    async function loadPage(page) {
        if (currentQuery.trim()) {
            return searchEntries(currentQuery, page, pageSize);
        }
        return fetchEntries(page, pageSize, {
            dateFrom: currentDateFrom || undefined,
            dateTo: currentDateTo || undefined,
            tag: currentTag || undefined,
        });
    }

    async function renderFirstPage() {
        currentPage = 1;
        entriesEl.innerHTML = skeletonCards(3);
        loadMoreEl.classList.add("hidden");
        updateClearButton();

        try {
            const data = await loadPage(1);
            entriesEl.innerHTML = "";

            if (!data || !data.entries || !Array.isArray(data.entries)) {
                entriesEl.innerHTML = `<div class="error-state"><p>Received unexpected data from server.</p></div>`;
                return;
            }

            if (data.entries.length === 0) {
                const hasFilters = currentQuery.trim() || currentDateFrom || currentDateTo;
                if (hasFilters) {
                    entriesEl.innerHTML = `
                        <div class="empty-state">
                            <h2>No entries match your filters</h2>
                            <p>Try different keywords or date range.</p>
                        </div>
                    `;
                } else {
                    entriesEl.innerHTML = `
                        <div class="empty-state">
                            <h2>Begin your journal</h2>
                            <p>Browse your photos and write about your memories.</p>
                            <a href="#/browse" class="btn btn-primary">Browse Photos</a>
                        </div>
                    `;
                    document.title = "Journal Empty - Thoughtful Frame";
                }
                return;
            }

            const fragment = document.createDocumentFragment();
            for (const entry of data.entries) {
                try {
                    fragment.appendChild(renderEntryCard(entry));
                } catch (renderError) {
                    console.error(`Failed to render entry ${entry.id}:`, renderError);
                }
            }
            entriesEl.appendChild(fragment);

            if (data.total > currentPage * pageSize) {
                loadMoreEl.classList.remove("hidden");
                const btn = loadMoreEl.querySelector("button");
                btn.textContent = "Load more";
                btn.disabled = false;
            }
        } catch (err) {
            console.error("Failed to load journal entries:", err);
            entriesEl.innerHTML = `
                <div class="error-state">
                    <p>Could not load journal entries.</p>
                    <p>${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    }

    await renderFirstPage();

    // Load more
    const loadMoreBtn = loadMoreEl.querySelector("button");

    // Declared before loadNextPage so the closure can reference it
    const loadMoreObserver = new IntersectionObserver(
        (entries) => { if (entries[0].isIntersecting) loadNextPage(); },
        { rootMargin: "200px" }
    );

    async function loadNextPage() {
        if (loadMoreBtn.disabled) return;
        currentPage++;
        loadMoreBtn.innerHTML = `Loading… <span class="spinner"></span>`;
        loadMoreBtn.disabled = true;
        try {
            const moreData = await loadPage(currentPage);
            const fragment = document.createDocumentFragment();
            for (const entry of moreData.entries) {
                fragment.appendChild(renderEntryCard(entry));
            }
            entriesEl.appendChild(fragment);
            if (moreData.total <= currentPage * pageSize) {
                loadMoreEl.innerHTML = `<p class="all-caught-up">✓ You're all caught up</p>`;
                loadMoreObserver.disconnect();
            } else {
                loadMoreBtn.textContent = "Load more";
                loadMoreBtn.disabled = false;
            }
        } catch (err) {
            loadMoreBtn.textContent = "Load more";
            loadMoreBtn.disabled = false;
        }
    }

    loadMoreBtn.addEventListener("click", loadNextPage);
    loadMoreObserver.observe(loadMoreBtn);

    // Debounced search
    let debounceTimer = null;
    searchInput.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (!document.getElementById("feed-entries")) return;
            const newQuery = searchInput.value;
            if (newQuery === currentQuery) return;
            currentQuery = newQuery;
            currentTag = "";
            renderFirstPage();
        }, 300);
    });

    // Disconnect observer and cancel debounce when navigating away (SPA teardown)
    function onHashChange() {
        loadMoreObserver.disconnect();
        clearTimeout(debounceTimer);
        window.removeEventListener("hashchange", onHashChange);
    }
    window.addEventListener("hashchange", onHashChange);

    // Date filters
    dateFromInput.addEventListener("change", () => {
        currentQuery = "";
        currentTag = "";
        searchInput.value = "";
        currentDateFrom = dateFromInput.value;
        renderFirstPage();
    });
    dateToInput.addEventListener("change", () => {
        currentQuery = "";
        currentTag = "";
        searchInput.value = "";
        currentDateTo = dateToInput.value;
        renderFirstPage();
    });

    // If there's an initial tag filter, show the clear button
    if (initialTag) updateClearButton();

    // Clear filters
    clearBtn.addEventListener("click", () => {
        currentQuery = "";
        currentDateFrom = "";
        currentDateTo = "";
        currentTag = "";
        searchInput.value = "";
        dateFromInput.value = "";
        dateToInput.value = "";
        window.history.replaceState(null, "", "#/");
        renderFirstPage();
    });
}

function skeletonCards(count) {
    return Array.from({ length: count })
        .map(
            () => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-thumb"></div>
            <div class="skeleton-body">
                <div class="skeleton skeleton-line short"></div>
                <div class="skeleton skeleton-line long"></div>
                <div class="skeleton skeleton-line medium"></div>
            </div>
        </div>
    `
        )
        .join("");
}
