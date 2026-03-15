import { fetchAssets, checkAssetsWithEntries, addAssetsToEntry, fetchEntry, fetchEntriesForAsset, getAllLinkedAssetIds } from "../api.js";
import { renderPhotoGrid } from "../components/photoGrid.js";
import { showEntryModal, showEntryPickerModal } from "../components/modal.js";
import { escapeHtml } from "../utils.js";

let multiSelectActive = false;
let selectedAssetIds = [];

// Cache for asset IDs that have journal entries
let _linkedAssetIds = null;
let _cacheLoaded = false;
let _cachePromise = null;

async function getLinkedAssetIds() {
    // If we have cached data, return it immediately
    if (_cacheLoaded) {
        return _linkedAssetIds;
    }

    // If there's already a fetch in progress, wait for it
    if (_cachePromise) {
        return _cachePromise;
    }

    // Otherwise, fetch fresh data
    _cachePromise = (async () => {
        try {
            _linkedAssetIds = await getAllLinkedAssetIds();
            _cacheLoaded = true;
            return _linkedAssetIds;
        } catch (err) {
            console.warn("Failed to fetch linked asset IDs cache, falling back to per-page checks:", err);
            _linkedAssetIds = new Set();
            _cacheLoaded = false;
            return _linkedAssetIds;
        } finally {
            _cachePromise = null;
        }
    })();

    return _cachePromise;
}

// Function to invalidate cache when new entries are created
export function invalidateLinkedAssetIdsCache() {
    _linkedAssetIds = null;
    _cacheLoaded = false;
}

/**
 * Renders the photo browsing interface with infinite scroll.
 */
export async function renderBrowse(container) {
    removeSelectionBar();
    multiSelectActive = false;
    selectedAssetIds = [];

    // Parse URL params from the hash (e.g. #/browse?entry=1&mode=add)
    // window.location.search is empty in hash-based routing
    const hashQuery = window.location.hash.includes('?')
        ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
        : '';
    const urlParams = new URLSearchParams(hashQuery);
    const modeParam = urlParams.get('mode');
    let entryIdForAdding = urlParams.get('entry');
    if (!entryIdForAdding && modeParam === 'add') {
        entryIdForAdding = sessionStorage.getItem('addImagesToEntry');
    }

    const isAddMode = modeParam === 'add' && entryIdForAdding;

    // In add-mode, fetch the entry's existing asset IDs so we can mark them
    let existingAssetIds = new Set();
    if (isAddMode) {
        try {
            const entry = await fetchEntry(entryIdForAdding);
            existingAssetIds = new Set(entry.immich_asset_ids);
        } catch (err) {
            console.error("Failed to fetch entry for add-mode:", err);
        }
    }

    container.innerHTML = `
        <div class="browse-container">
            <div class="browse-header">
                <h2 class="browse-title">${isAddMode ? 'Select Photos to Add' : 'Your Photos'}</h2>
                <button class="btn btn-secondary" id="toggle-select">${isAddMode ? 'Cancel' : 'Select Multiple'}</button>
                ${isAddMode ? `<button class="btn btn-primary" id="add-to-entry">Add to Entry</button>` : ''}
            </div>
            <div class="photo-grid" id="photo-grid">
                ${skeletonGrid(12)}
            </div>
            <div id="scroll-sentinel" class="scroll-sentinel"></div>
        </div>
    `;

    const gridEl = document.getElementById("photo-grid");
    const sentinelEl = document.getElementById("scroll-sentinel");
    const toggleBtn = document.getElementById("toggle-select");
    const addToEntryBtn = document.getElementById("add-to-entry");

    let currentPage = 1;
    const pageSize = 100;
    let isLoading = false;
    let hasMore = true;

    const returnToEntry = () => { window.location.hash = `#/entry/${entryIdForAdding}`; };

    // Toggle multi-select mode
    toggleBtn.addEventListener("click", () => {
        if (isAddMode && !multiSelectActive) {
            returnToEntry();
            return;
        }

        multiSelectActive = !multiSelectActive;
        toggleBtn.textContent = multiSelectActive ? "Cancel Selection" : (isAddMode ? 'Cancel' : 'Select Multiple');
        gridEl.classList.toggle("multi-select-active", multiSelectActive);

        if (!multiSelectActive) {
            selectedAssetIds = [];
            gridEl.querySelectorAll(".photo-grid-item.selected").forEach((el) => {
                el.classList.remove("selected");
            });
            removeSelectionBar();
            if (isAddMode) returnToEntry();
        }
    });

    // Handle "Add to Entry" button
    if (addToEntryBtn) {
        addToEntryBtn.addEventListener("click", async () => {
            if (selectedAssetIds.length === 0) {
                alert("Please select at least one photo to add to the entry.");
                return;
            }

            try {
                const data = await addAssetsToEntry(entryIdForAdding, selectedAssetIds);
                alert(`Successfully added ${data.added.length} images to the entry!`);

                selectedAssetIds = [];
                gridEl.querySelectorAll(".photo-grid-item.selected").forEach((el) => {
                    el.classList.remove("selected");
                });

                window.location.hash = `#/entry/${entryIdForAdding}`;
            } catch (err) {
                alert("Failed to add images to entry: " + err.message);
            }
        });
    }

    async function loadNextPage() {
        if (isLoading || !hasMore) return;
        isLoading = true;

        try {
            const data = await fetchAssets(currentPage, pageSize);
            const assets = extractAssets(data);

            if (currentPage === 1) {
                gridEl.innerHTML = "";
            }

            if (assets.length > 0) {
                const assetIds = assets.map((a) => a.id);
                
                // Use cached linked asset IDs instead of making API call for each page
                const linkedAssetIds = await getLinkedAssetIds();
                let assetsWithEntries;
                
                if (_cacheLoaded) {
                    // Use cache (may be empty set if user has no entries yet — that's correct)
                    assetsWithEntries = new Set(assetIds.filter(id => linkedAssetIds.has(id)));
                } else {
                    // Cache fetch failed; fall back to per-page check
                    console.log("Using fallback per-page check for asset entries");
                    assetsWithEntries = await checkAssetsWithEntries(assetIds);
                }
                
                gridEl.appendChild(renderPhotoGrid(assets, assetsWithEntries, existingAssetIds));
                attachGridClickHandlers(gridEl);
            }

            hasMore = hasMorePages(data, currentPage, pageSize);
            if (!hasMore) {
                sentinelEl.remove();
            }

            currentPage++;
        } catch (err) {
            if (currentPage === 1) {
                gridEl.innerHTML = `
                    <div class="error-state">
                        <p>Could not load photos. Is the Immich server running?</p>
                        <p>${escapeHtml(err.message)}</p>
                    </div>
                `;
            } else {
                console.error("Failed to load more assets:", err);
            }
        } finally {
            isLoading = false;
        }

        // If sentinel is still in viewport after loading, keep loading
        if (hasMore && sentinelEl.parentNode) {
            const rect = sentinelEl.getBoundingClientRect();
            if (rect.top < window.innerHeight + 200) {
                loadNextPage();
            }
        }
    }

    function updateSelectionBar() {
        let bar = document.querySelector(".selection-bar");

        if (selectedAssetIds.length === 0) {
            removeSelectionBar();
            return;
        }

        if (!bar) {
            bar = document.createElement("div");
            bar.className = "selection-bar";
            document.body.appendChild(bar);
        }

        const count = selectedAssetIds.length;
        bar.innerHTML = `
            <span class="selection-count">${count} photo${count !== 1 ? "s" : ""} selected</span>
            <div class="selection-actions">
                <button class="btn btn-secondary" id="selection-clear">Clear</button>
                ${!isAddMode ? '<button class="btn btn-primary" id="selection-write">Write Entry</button>' : ''}
            </div>
        `;

        document.getElementById("selection-clear").addEventListener("click", () => {
            selectedAssetIds = [];
            document.querySelectorAll(".photo-grid-item.selected").forEach((el) => {
                el.classList.remove("selected");
            });
            removeSelectionBar();
        });

        if (!isAddMode) {
            document.getElementById("selection-write").addEventListener("click", () => {
                if (selectedAssetIds.length > 0) {
                    showEntryModal([...selectedAssetIds]);
                }
            });
        }
    }

    function attachGridClickHandlers(grid) {
        grid.querySelectorAll(".photo-grid-item").forEach((item) => {
            if (item.dataset.clickAttached) return;
            item.dataset.clickAttached = "true";

            if (item.classList.contains("already-in-entry")) return;

            item.addEventListener("click", async () => {
                const assetId = item.dataset.assetId;

                if (multiSelectActive) {
                    const idx = selectedAssetIds.indexOf(assetId);
                    if (idx >= 0) {
                        selectedAssetIds.splice(idx, 1);
                        item.classList.remove("selected");
                    } else {
                        selectedAssetIds.push(assetId);
                        item.classList.add("selected");
                    }
                    updateSelectionBar();
                } else {
                    if (isAddMode) {
                        multiSelectActive = true;
                        toggleBtn.textContent = "Cancel Selection";
                        gridEl.classList.add("multi-select-active");
                        selectedAssetIds = [assetId];
                        item.classList.add("selected");
                        updateSelectionBar();
                        return;
                    }
                    try {
                        const entries = await fetchEntriesForAsset(assetId);
                        if (entries.length === 0) {
                            showEntryModal([assetId], null, item.dataset.fileCreatedAt || null);
                        } else if (entries.length === 1) {
                            window.location.hash = `#/entry/${entries[0].id}`;
                        } else {
                            showEntryPickerModal(assetId, entries);
                        }
                    } catch {
                        showEntryModal([assetId]);
                    }
                }
            });
        });
    }

    // Load first page, then set up observer so it correctly detects
    // whether the sentinel is still in view after the initial load.
    await loadNextPage();

    if (sentinelEl.parentNode) {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadNextPage();
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(sentinelEl);
    }
}


function removeSelectionBar() {
    const bar = document.querySelector(".selection-bar");
    if (bar) bar.remove();
}

function extractAssets(data) {
    if (data.assets && data.assets.items) {
        return data.assets.items;
    }
    if (Array.isArray(data)) {
        return data;
    }
    return [];
}

function hasMorePages(data, currentPage, pageSize) {
    if (data.assets && data.assets.nextPage) {
        return true;
    }
    const items = extractAssets(data);
    return items.length === pageSize;
}

function skeletonGrid(count) {
    return Array.from({ length: count })
        .map(() => `<div class="skeleton skeleton-grid-item"></div>`)
        .join("");
}
