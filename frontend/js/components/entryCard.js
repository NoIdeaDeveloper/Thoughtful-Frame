import { thumbnailUrl } from "../api.js";
import { formatDate } from "../utils.js";

export function renderEntryCard(entry) {
    const isMulti = entry.immich_asset_ids.length > 1;
    const card = document.createElement("a");
    card.href = `#/entry/${entry.id}`;
    card.className = "entry-card";

    if (isMulti) {
        // Multi-photo: scrollable row on top, text below
        card.innerHTML = `
            <div class="photo-scroll-row">
                ${entry.immich_asset_ids
                    .map(
                        (id) =>
                            `<img src="${thumbnailUrl(id)}" loading="lazy" alt="Photo">`
                    )
                    .join("")}
            </div>
            <div class="entry-card-body">
                ${entry.title ? `<h3 class="entry-card-title">${escapeHtml(entry.title)}</h3>` : ""}
                <p class="entry-card-text">${escapeHtml(truncate(entry.body, 200))}</p>
                <span class="entry-card-date">${formatDate(entry.created_at)}</span>
            </div>
        `;
    } else {
        // Single photo: image left, text right
        card.classList.add("entry-card-single");
        card.innerHTML = `
            <img class="entry-card-thumb" src="${thumbnailUrl(entry.immich_asset_ids[0])}" loading="lazy" alt="Photo">
            <div class="entry-card-body">
                ${entry.title ? `<h3 class="entry-card-title">${escapeHtml(entry.title)}</h3>` : ""}
                <p class="entry-card-text">${escapeHtml(truncate(entry.body, 200))}</p>
                <span class="entry-card-date">${formatDate(entry.created_at)}</span>
            </div>
        `;
    }

    return card;
}

function truncate(str, max) {
    if (str.length <= max) return str;
    return str.slice(0, max).trimEnd() + "...";
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
