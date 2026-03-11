import { fetchAssets, checkAssetsWithEntries } from "../api.js";
import { renderPhotoGrid } from "../components/photoGrid.js";
import { showEntryModal } from "../components/modal.js";

let multiSelectActive = false;
let selectedAssetIds = [];
let entryIdForAdding = null;  // Track entry ID when adding images

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const entryIdParam = urlParams.get('entry');
const modeParam = urlParams.get('mode');

export async function renderBrowse(container) {
    removeSelectionBar();
    multiSelectActive = false;
    selectedAssetIds = [];
    entryIdForAdding = entryIdParam || null;

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
                const response = await fetch(`/api/journal/entries/${entryIdForAdding}/assets`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ immich_asset_ids: selectedAssetIds })
                });

                if (!response.ok) throw new Error(await response.text());

                const data = await response.json();
                alert(`Successfully added ${data.added.length} images to the entry!`);
                
                // Clear selection and return to entry view
                selectedAssetIds = [];
                gridEl.querySelectorAll(".photo-grid-item.selected").forEach((el) => {
                    el.classList.remove("selected");
                });
                
                // Navigate back to the entry
                window.location.hash = `#/entry/${entryIdForAdding}`;
            } catch (err) {
                alert("Failed to add images to entry: " + err.message);
            }
        });
    }

    try {
        const data = await fetchAssets(currentPage, pageSize);
        console.log("Full API response:", data);
        
        const assets = extractAssets(data);
        allLoadedAssets = assets;

        const assetIds = assets.map((a) => a.id);
        const assetsWithEntries = await checkAssetsWithEntries(assetIds);

        gridEl.innerHTML = "";
        gridEl.appendChild(renderPhotoGrid(assets, assetsWithEntries));

        console.log(`Current page: ${currentPage}, Page size: ${pageSize}, Items loaded: ${assets.length}`);
        
        // Debug the pagination data
        if (data.assets) {
            console.log(`Immich total: ${data.assets.total || 'N/A'}, items: ${data.assets.items ? data.assets.items.length : 'N/A'}`);
        } else {
            console.log("No assets data in response");
        }
        
        const showLoadMore = hasMorePages(data, currentPage, pageSize);
        console.log(`hasMorePages result: ${showLoadMore}`);
        console.log(`Calculation: total=${data.assets?.total || 'unknown'}, current=${currentPage * pageSize}`);
        
        // Force show Load More button for testing
        // TODO: Remove this after debugging
        if (assets.length > 0) {
            loadMoreEl.classList.remove("hidden");
            console.log("DEBUG: Forcing Load More button to show");
        } else {
            loadMoreEl.classList.add("hidden");
        }

        attachGridClickHandlers(gridEl);

        // Load more
        loadMoreEl.querySelector("button").addEventListener("click", async () => {
            currentPage++;
            const btn = loadMoreEl.querySelector("button");
            btn.textContent = "Loading...";
            btn.disabled = true;

            try {
                console.log(`Loading more assets, page ${currentPage}`);
                const moreData = await fetchAssets(currentPage, pageSize);
                console.log("More data received:", moreData);
                const moreAssets = extractAssets(moreData);
                console.log(`Loaded ${moreAssets.length} more assets`);
                allLoadedAssets = allLoadedAssets.concat(moreAssets);

                const moreIds = moreAssets.map((a) => a.id);
                const moreWithEntries = await checkAssetsWithEntries(moreIds);

                gridEl.appendChild(renderPhotoGrid(moreAssets, moreWithEntries));
                attachGridClickHandlers(gridEl);

                btn.textContent = "Load more";
                btn.disabled = false;

                if (!hasMorePages(moreData, currentPage, pageSize)) {
                    loadMoreEl.classList.add("hidden");
                    console.log("All assets loaded, hiding Load More button");
                } else {
                    console.log("More assets available, keeping Load More button");
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

function attachGridClickHandlers(gridEl) {
    gridEl.querySelectorAll(".photo-grid-item").forEach((item) => {
        // Only attach once
        if (item.dataset.clickAttached) return;
        item.dataset.clickAttached = "true";

        item.addEventListener("click", () => {
            const assetId = item.dataset.assetId;

            if (multiSelectActive) {
                // Toggle selection
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
                // Single photo entry
                showEntryModal([assetId]);
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
    // Immich search/metadata response structure
    if (data.assets && data.assets.items) {
        return data.assets.items;
    }
    if (Array.isArray(data)) {
        return data;
    }
    return [];
}

function hasMorePages(data, currentPage, pageSize) {
    // Check if we have total count from Immich API
    if (data.assets && data.assets.total) {
        return data.assets.total > currentPage * pageSize;
    }
    
    // Simplified fallback logic: show "Load More" if we got any items
    // This is more user-friendly than trying to guess if there are more pages
    const items = extractAssets(data);
    if (items.length === 0) return false;
    
    // If we got exactly pageSize items, definitely show "Load More"
    if (items.length === pageSize) {
        return true;
    }
    
    // If we got some items but less than pageSize, still show "Load More"
    // The user can decide if they want to try loading more
    return items.length > 0;
}

function skeletonGrid(count) {
    return Array.from({ length: count })
        .map(() => `<div class="skeleton skeleton-grid-item"></div>`)
        .join("");
}
