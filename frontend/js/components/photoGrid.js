import { thumbnailUrl } from "../api.js";

function escapeAttr(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Renders a grid of photo items as a DocumentFragment.
 *
 * @param {Array} assets - Array of Immich asset objects
 * @param {Set} assetsWithEntries - Set of asset IDs that have any journal entry
 * @param {Set} alreadyInEntry - Set of asset IDs already in the current entry (add-mode only)
 */
export function renderPhotoGrid(assets, assetsWithEntries, alreadyInEntry = new Set()) {
    const fragment = document.createDocumentFragment();

    for (const asset of assets) {
        const item = document.createElement("div");
        const isAlreadyAdded = alreadyInEntry.has(asset.id);
        const hasEntry = assetsWithEntries.has(asset.id);

        item.className = `photo-grid-item${isAlreadyAdded ? " already-in-entry" : ""}`;
        item.dataset.assetId = asset.id;

        item.innerHTML = `
            <img src="${thumbnailUrl(asset.id)}" loading="lazy" alt="${escapeAttr(asset.originalFileName || 'Photo')}">
            <span class="entry-badge ${hasEntry && !isAlreadyAdded ? "" : "hidden"}">&#9998;</span>
            <span class="select-check">&#10003;</span>
            ${isAlreadyAdded ? `<span class="already-added-badge">&#10003; Added</span>` : ""}
        `;

        fragment.appendChild(item);
    }

    return fragment;
}
