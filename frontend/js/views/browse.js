import { fetchAssets, checkAssetsWithEntries } from "../api.js";
import { renderPhotoGrid } from "../components/photoGrid.js";
import { showEntryModal } from "../components/modal.js";

let multiSelectActive = false;
let selectedAssetIds = [];

export async function renderBrowse(container) {
    multiSelectActive = false;
    selectedAssetIds = [];

    container.innerHTML = `
        <div class="browse-container">
            <div class="browse-header">
                <h2 class="browse-title">Your Photos</h2>
                <button class="btn btn-secondary" id="toggle-select">Select Multiple</button>
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

    let currentPage = 1;
    const pageSize = 50;
    let allLoadedAssets = [];

    // Toggle multi-select mode
    toggleBtn.addEventListener("click", () => {
        multiSelectActive = !multiSelectActive;
        toggleBtn.textContent = multiSelectActive ? "Cancel Selection" : "Select Multiple";
        gridEl.classList.toggle("multi-select-active", multiSelectActive);

        if (!multiSelectActive) {
            selectedAssetIds = [];
            gridEl.querySelectorAll(".photo-grid-item.selected").forEach((el) => {
                el.classList.remove("selected");
            });
            removeSelectionBar();
        }
    });

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

        // Load more
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
