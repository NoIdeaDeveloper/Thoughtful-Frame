import { fetchEntry, deleteEntry, originalUrl, thumbnailUrl } from "../api.js";
import { formatDate } from "../utils.js";
import { showEntryModal } from "../components/modal.js";

export async function renderEntry(container, entryId) {
    container.innerHTML = `
        <div class="entry-detail">
            <div class="skeleton" style="height: 300px; margin-bottom: 24px; border-radius: 8px;"></div>
            <div class="skeleton skeleton-line medium" style="height: 28px; margin-bottom: 12px;"></div>
            <div class="skeleton skeleton-line short" style="height: 14px; margin-bottom: 24px;"></div>
            <div class="skeleton skeleton-line long" style="height: 14px; margin-bottom: 8px;"></div>
            <div class="skeleton skeleton-line long" style="height: 14px; margin-bottom: 8px;"></div>
            <div class="skeleton skeleton-line medium" style="height: 14px;"></div>
        </div>
    `;

    try {
        const entry = await fetchEntry(entryId);
        const isMulti = entry.immich_asset_ids.length > 1;

        let photosHtml;
        if (isMulti) {
            photosHtml = `
                <div class="entry-detail-photos multi">
                    ${entry.immich_asset_ids
                        .map(
                            (id) =>
                                `<img src="${originalUrl(id)}" loading="lazy" alt="Photo" data-asset-id="${id}">`
                        )
                        .join("")}
                </div>
            `;
        } else {
            photosHtml = `
                <div class="entry-detail-photos single">
                    <img src="${originalUrl(entry.immich_asset_ids[0])}" alt="Photo">
                </div>
            `;
        }

        container.innerHTML = `
            <div class="entry-detail">
                ${photosHtml}
                ${entry.title ? `<h2 class="entry-detail-title">${escapeHtml(entry.title)}</h2>` : ""}
                <div class="entry-detail-date">
                    ${formatDate(entry.created_at)}
                    ${entry.updated_at !== entry.created_at ? ` (edited ${formatDate(entry.updated_at)})` : ""}
                </div>
                <div class="entry-detail-body">${escapeHtml(entry.body)}</div>
                <div class="entry-detail-actions">
                    <button class="btn btn-secondary" id="entry-edit">Edit</button>
                    ${entry.immich_asset_ids.length > 1 ? `
                        <button class="btn btn-secondary" id="entry-remove-images">Remove Images</button>
                    ` : ''}
                    <button class="btn btn-secondary" id="entry-add-images">Add Images</button>
                    <button class="btn btn-danger" id="entry-delete">Delete</button>
                    <a href="#/" class="btn btn-secondary">Back to Journal</a>
                </div>
            </div>
        `;

        // Lightbox for multi-photo entries
        if (isMulti) {
            container.querySelectorAll(".entry-detail-photos.multi img").forEach((img) => {
                img.addEventListener("click", () => {
                    showLightbox(img.src);
                });
            });
        }

        // Edit
        document.getElementById("entry-edit").addEventListener("click", () => {
            showEntryModal(entry.immich_asset_ids, entry);
        });

        // Add images
        document.getElementById("entry-add-images").addEventListener("click", () => {
            showAddImagesModal(entry.id);
        });

        // Remove images (only shown for multi-image entries)
        const removeBtn = document.getElementById("entry-remove-images");
        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                showRemoveImagesModal(entry.id, entry.immich_asset_ids);
            });
        }

        // Delete
        document.getElementById("entry-delete").addEventListener("click", () => {
            showDeleteConfirm(entry.id);
        });
    } catch (err) {
        container.innerHTML = `
            <div class="entry-detail">
                <div class="error-state">
                    <p>Could not load this entry.</p>
                    <p>${err.message}</p>
                    <a href="#/" class="btn btn-secondary">Back to Journal</a>
                </div>
            </div>
        `;
    }
}

function showLightbox(src) {
    const lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.innerHTML = `<img src="${src}" alt="Full size photo">`;
    lightbox.addEventListener("click", () => lightbox.remove());
    document.addEventListener("keydown", function handler(e) {
        if (e.key === "Escape") {
            lightbox.remove();
            document.removeEventListener("keydown", handler);
        }
    });
    document.body.appendChild(lightbox);
}

function showDeleteConfirm(entryId) {
    const overlay = document.getElementById("modal-overlay");
    const container = document.getElementById("modal-container");

    container.innerHTML = `
        <h2 class="modal-title">Delete Entry</h2>
        <p style="margin-bottom: 20px; color: var(--text-muted);">Are you sure you want to delete this journal entry? This cannot be undone.</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="delete-cancel">Cancel</button>
            <button class="btn btn-danger" id="delete-confirm">Delete</button>
        </div>
    `;

    overlay.classList.remove("hidden");

    document.getElementById("delete-cancel").addEventListener("click", () => {
        overlay.classList.add("hidden");
        container.innerHTML = "";
    });

    document.getElementById("delete-confirm").addEventListener("click", async () => {
        const btn = document.getElementById("delete-confirm");
        btn.disabled = true;
        btn.textContent = "Deleting...";

        try {
            await deleteEntry(entryId);
            overlay.classList.add("hidden");
            container.innerHTML = "";
            window.location.hash = "#/";
        } catch (err) {
            btn.disabled = false;
            btn.textContent = "Delete";
            alert("Failed to delete: " + err.message);
        }
    });
}

function showAddImagesModal(entryId) {
    const overlay = document.getElementById("modal-overlay");
    const container = document.getElementById("modal-container");

    container.innerHTML = `
        <h2 class="modal-title">Add Images to Entry</h2>
        <p style="margin-bottom: 20px; color: var(--text-muted);">Select photos to add to this journal entry.</p>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="add-images-cancel">Cancel</button>
            <button class="btn btn-primary" id="add-images-select">Select Photos</button>
        </div>
    `;

    overlay.classList.remove("hidden");

    document.getElementById("add-images-cancel").addEventListener("click", () => {
        overlay.classList.add("hidden");
        container.innerHTML = "";
    });

    document.getElementById("add-images-select").addEventListener("click", () => {
        overlay.classList.add("hidden");
        container.innerHTML = "";
        // Redirect to browse view with multi-select enabled and this entry ID
        window.location.hash = `#/browse?entry=${entryId}&mode=add`;
    });
}

function showRemoveImagesModal(entryId, currentAssetIds) {
    const overlay = document.getElementById("modal-overlay");
    const container = document.getElementById("modal-container");

    container.innerHTML = `
        <h2 class="modal-title">Remove Images</h2>
        <p style="margin-bottom: 20px; color: var(--text-muted);">Select which images to remove from this entry.</p>
        <div class="modal-asset-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
            ${currentAssetIds.map(assetId => `
                <label class="modal-asset-item">
                    <input type="checkbox" value="${assetId}" class="asset-checkbox">
                    <img src="${thumbnailUrl(assetId)}" loading="lazy" style="width: 60px; height: 60px; object-fit: cover; margin-right: 10px;">
                    ${assetId}
                </label>
            `).join("")}
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="remove-images-cancel">Cancel</button>
            <button class="btn btn-danger" id="remove-images-confirm">Remove Selected</button>
        </div>
    `;

    overlay.classList.remove("hidden");

    document.getElementById("remove-images-cancel").addEventListener("click", () => {
        overlay.classList.add("hidden");
        container.innerHTML = "";
    });

    document.getElementById("remove-images-confirm").addEventListener("click", async () => {
        const btn = document.getElementById("remove-images-confirm");
        btn.disabled = true;
        btn.textContent = "Removing...";

        try {
            const checkboxes = document.querySelectorAll(".asset-checkbox:checked");
            const assetIds = Array.from(checkboxes).map(cb => cb.value);

            if (assetIds.length === 0) {
                alert("Please select at least one image to remove.");
                btn.disabled = false;
                btn.textContent = "Remove Selected";
                return;
            }

            const response = await fetch(`/api/journal/entries/${entryId}/assets`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ asset_ids: assetIds })
            });

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            overlay.classList.add("hidden");
            container.innerHTML = "";
            
            // Refresh the entry view
            await renderEntry(document.querySelector(".main-container"), entryId);
            alert(`Successfully removed ${data.removed} image(s)!`);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = "Remove Selected";
            alert("Failed to remove images: " + err.message);
        }
    });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
