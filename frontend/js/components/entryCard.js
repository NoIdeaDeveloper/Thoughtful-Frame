import { thumbnailUrl } from "../api.js";
import { formatDate, escapeHtml } from "../utils.js";

export function renderEntryCard(entry) {
    // Validate entry structure
    if (!entry || !entry.id || !entry.immich_asset_ids || !Array.isArray(entry.immich_asset_ids) || entry.immich_asset_ids.length === 0) {
        console.error("Invalid entry data:", entry);
        const errorCard = document.createElement("div");
        errorCard.className = "error-card";
        errorCard.innerHTML = `
            <div class="error-card-content">
                <p>Invalid entry data</p>
                <p>Entry ID: ${entry?.id || 'unknown'}</p>
            </div>
        `;
        return errorCard;
    }
    
    const isMulti = entry.immich_asset_ids.length > 1;
    const card = document.createElement("a");
    card.href = `#/entry/${entry.id}`;
    card.className = "entry-card";

    // Defensive programming: handle missing or invalid data
    const safeBody = entry.body || "";
    const safeTitle = entry.title || "";
    const safeCreatedAt = entry.created_at || new Date().toISOString();
    
    console.log(`Rendering entry ${entry.id}: title="${safeTitle}", body="${safeBody.substring(0, 50)}...", assets=${entry.immich_asset_ids.length}`);

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
                ${safeTitle ? `<h3 class="entry-card-title">${escapeHtml(safeTitle)}</h3>` : ""}
                <p class="entry-card-text">${escapeHtml(truncate(safeBody, 200))}</p>
                <span class="entry-card-date">${formatDate(safeCreatedAt)}</span>
            </div>
        `;
    } else {
        // Single photo: image left, text right
        card.classList.add("entry-card-single");
        card.innerHTML = `
            <img class="entry-card-thumb" src="${thumbnailUrl(entry.immich_asset_ids[0])}" loading="lazy" alt="Photo">
            <div class="entry-card-body">
                ${safeTitle ? `<h3 class="entry-card-title">${escapeHtml(safeTitle)}</h3>` : ""}
                <p class="entry-card-text">${escapeHtml(truncate(safeBody, 200))}</p>
                <span class="entry-card-date">${formatDate(safeCreatedAt)}</span>
            </div>
        `;
    }

    return card;
}

export function truncate(str, max) {
    if (!str || typeof str !== 'string') {
        console.warn("truncate: received non-string input:", str);
        return "";
    }
    if (str.length <= max) return str;
    return str.slice(0, max).trimEnd() + "...";
}
