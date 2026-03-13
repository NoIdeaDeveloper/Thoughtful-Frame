import { fetchAssets, checkAssetsWithEntries, addAssetsToEntry, fetchEntry, fetchEntriesForAsset } from "../api.js";
import { renderPhotoGrid } from "../components/photoGrid.js";
import { showEntryModal, showEntryPickerModal } from "../components/modal.js";

let multiSelectActive = false;
let selectedAssetIds = [];

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

    // Toggle multi-select mode
    toggleBtn.addEventListener("click", () => {
        multiSelectActive = !multiSelectActive;
        toggleBtn.textContent = multiSelectActive ? "Cancel Selection" : (isAddMode ? 'Cancel' : 'Select Multiple');
        gridEl.classList.toggle("multi-select-active", multiSelectActive);

        if (!multiSelectActive) {
            selectedAssetIds = [];
            gridEl.querySelectorAll(".photo-grid-item.selected").forEach((el) => {
                el.classList.remove("selected");
            });
            removeSelectionBar();
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
                const assetsWithEntries = await checkAssetsWithEntries(assetIds);
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
                        <p>${err.message}</p>
                    </div>
                `;
            } else {
                console.error("Failed to load more assets:", err);
            }
        } finally {
            isLoading = false;
        }
    }

    // Infinite scroll via IntersectionObserver
    const observer = new IntersectionObserver(
        (entries) => {
            if (entries[0].isIntersecting) {
                loadNextPage();
            }
        },
        { rootMargin: "200px" }
    );
    observer.observe(sentinelEl);

    // Load first page immediately
    await loadNextPage();
}

/**
 * Attaches click handlers to grid items that don't already have one.
 * Items in `existingAssetIds` are skipped (already in the entry).
 */
function attachGridClickHandlers(gridEl) {
    gridEl.querySelectorAll(".photo-grid-item").forEach((item) => {
        if (item.dataset.clickAttached) return;
        item.dataset.clickAttached = "true";

        // Already-in-entry items are not interactive
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
                // In add-mode, always open the create modal
                if (item.closest(".browse-container")?.querySelector("#add-to-entry")) {
                    showEntryModal([assetId]);
                    return;
                }
                try {
                    const entries = await fetchEntriesForAsset(assetId);
                    if (entries.length === 0) {
                        showEntryModal([assetId]);
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
            <button class="btn btn-primary" id="selection-write">Write Entry</button>
        </div>
    `;

    document.getElementById("selection-clear").addEventListener("click", () => {
        selectedAssetIds = [];
        document.querySelectorAll(".photo-grid-item.selected").forEach((el) => {
            el.classList.remove("selected");
        });
        removeSelectionBar();
    });

    document.getElementById("selection-write").addEventListener("click", () => {
        if (selectedAssetIds.length > 0) {
            showEntryModal([...selectedAssetIds]);
        }
    });
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
    if (data.assets && data.assets.total) {
        return data.assets.total > currentPage * pageSize;
    }
    const items = extractAssets(data);
    return items.length === pageSize;
}

function skeletonGrid(count) {
    return Array.from({ length: count })
        .map(() => `<div class="skeleton skeleton-grid-item"></div>`)
        .join("");
}
