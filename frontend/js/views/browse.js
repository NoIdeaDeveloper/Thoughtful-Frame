import { fetchAssets, checkAssetsWithEntries, addAssetsToEntry } from "../api.js";
import { renderPhotoGrid } from "../components/photoGrid.js";
import { showEntryModal } from "../components/modal.js";

/**
 * Global state variables for the browse view
 */
let multiSelectActive = false;
let selectedAssetIds = [];

/**
 * Renders the photo browsing interface
 *
 * @param {HTMLElement} container - The DOM container to render the browse view into
 * @returns {Promise<void>} Resolves when rendering is complete
 */
export async function renderBrowse(container) {
    removeSelectionBar();
    multiSelectActive = false;
    selectedAssetIds = [];

    // Parse URL params each render so values are always current
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    let entryIdForAdding = urlParams.get('entry');
    if (!entryIdForAdding && modeParam === 'add') {
        entryIdForAdding = sessionStorage.getItem('addImagesToEntry');
    }

    // Check if we're in "add images to entry" mode
    const isAddMode = modeParam === 'add' && entryIdForAdding;

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
            <div class="load-more-container hidden" id="browse-load-more">
                <button class="btn btn-secondary">Load more</button>
            </div>
        </div>
    `;

    const gridEl = document.getElementById("photo-grid");
    const loadMoreEl = document.getElementById("browse-load-more");
    const toggleBtn = document.getElementById("toggle-select");
    const addToEntryBtn = document.getElementById("add-to-entry");

    let currentPage = 1;
    const pageSize = 100;
    let allLoadedAssets = [];

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

    try {
        const data = await fetchAssets(currentPage, pageSize);

        const assets = extractAssets(data);
        allLoadedAssets = assets;

        const assetIds = assets.map((a) => a.id);
        const assetsWithEntries = await checkAssetsWithEntries(assetIds);

        gridEl.innerHTML = "";
        gridEl.appendChild(renderPhotoGrid(assets, assetsWithEntries));

        if (hasMorePages(data, currentPage, pageSize)) {
            loadMoreEl.classList.remove("hidden");
        }

        attachGridClickHandlers(gridEl);

        // Load more — button is freshly created each renderBrowse, so one listener is safe
        loadMoreEl.querySelector("button").addEventListener("click", async () => {
            currentPage++;
            const btn = loadMoreEl.querySelector("button");
            btn.textContent = "Loading...";
            btn.disabled = true;

            try {
                const moreData = await fetchAssets(currentPage, pageSize);
                const moreAssets = extractAssets(moreData);
                allLoadedAssets = allLoadedAssets.concat(moreAssets);

                const moreIds = moreAssets.map((a) => a.id);
                const moreWithEntries = await checkAssetsWithEntries(moreIds);

                gridEl.appendChild(renderPhotoGrid(moreAssets, moreWithEntries));
                attachGridClickHandlers(gridEl);

                btn.textContent = "Load more";
                btn.disabled = false;

                if (!hasMorePages(moreData, currentPage, pageSize)) {
                    loadMoreEl.classList.add("hidden");
                }
            } catch (err) {
                btn.textContent = "Load more";
                btn.disabled = false;
                console.error("Failed to load more assets:", err);
            }
        });
    } catch (err) {
        gridEl.innerHTML = `
            <div class="error-state">
                <p>Could not load photos. Is the Immich server running?</p>
                <p>${err.message}</p>
            </div>
        `;
    }
}

/**
 * Attaches click event handlers to photo grid items
 */
function attachGridClickHandlers(gridEl) {
    gridEl.querySelectorAll(".photo-grid-item").forEach((item) => {
        // Only attach once
        if (item.dataset.clickAttached) return;
        item.dataset.clickAttached = "true";

        item.addEventListener("click", () => {
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
                showEntryModal([assetId]);
            }
        });
    });
}

/**
 * Updates the selection bar with current selection count and actions
 */
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

/**
 * Removes the selection bar from the DOM
 */
function removeSelectionBar() {
    const bar = document.querySelector(".selection-bar");
    if (bar) bar.remove();
}

/**
 * Extracts asset array from Immich API response
 */
function extractAssets(data) {
    if (data.assets && data.assets.items) {
        return data.assets.items;
    }
    if (Array.isArray(data)) {
        return data;
    }
    return [];
}

/**
 * Determines if there are more pages of assets to load
 */
function hasMorePages(data, currentPage, pageSize) {
    if (data.assets && data.assets.total) {
        return data.assets.total > currentPage * pageSize;
    }
    const items = extractAssets(data);
    // If we got a full page, there may be more; if partial, we've reached the end
    return items.length === pageSize;
}

/**
 * Generates skeleton loading grid items
 */
function skeletonGrid(count) {
    return Array.from({ length: count })
        .map(() => `<div class="skeleton skeleton-grid-item"></div>`)
        .join("");
}
