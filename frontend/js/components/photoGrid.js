import { thumbnailUrl } from "../api.js";

export function renderPhotoGrid(assets, assetsWithEntries) {
    const fragment = document.createDocumentFragment();

    for (const asset of assets) {
        const item = document.createElement("div");
        item.className = "photo-grid-item";
        item.dataset.assetId = asset.id;

        const hasEntry = assetsWithEntries.has(asset.id);

        item.innerHTML = `
            <img src="${thumbnailUrl(asset.id)}" loading="lazy" alt="${asset.originalFileName || 'Photo'}">
            <span class="entry-badge ${hasEntry ? "" : "hidden"}">&#9998;</span>
            <span class="select-check">&#10003;</span>
        `;

        fragment.appendChild(item);
    }

    return fragment;
}
