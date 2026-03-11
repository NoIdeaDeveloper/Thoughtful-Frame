import { thumbnailUrl, createEntry, updateEntry } from "../api.js";
import { escapeHtml } from "../utils.js";

const overlay = document.getElementById("modal-overlay");
const container = document.getElementById("modal-container");

/**
 * Escape HTML attributes to prevent XSS in attribute contexts
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string
 */
function escapeAttr(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function showEntryModal(assetIds, existingEntry = null) {
    const isEdit = existingEntry !== null;

    container.innerHTML = `
        <h2 class="modal-title">${isEdit ? "Edit Entry" : "New Journal Entry"}</h2>
        <div class="modal-photos">
            ${assetIds
                .map(
                    (id) =>
                        `<img src="${thumbnailUrl(id)}" alt="Photo">`
                )
                .join("")}
        </div>
        <div class="modal-field">
            <label for="modal-entry-title">Title (optional)</label>
            <input type="text" id="modal-entry-title" placeholder="Give this memory a title..."
                   value="${isEdit ? escapeAttr(existingEntry.title) : ""}">
        </div>
        <div class="modal-field">
            <label for="modal-entry-body">Your thoughts</label>
            <textarea id="modal-entry-body" placeholder="Write about this moment...">${isEdit ? escapeHtml(existingEntry.body) : ""}</textarea>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-save">${isEdit ? "Save Changes" : "Save Entry"}</button>
        </div>
    `;

    overlay.classList.remove("hidden");

    // Auto-resize textarea
    const textarea = document.getElementById("modal-entry-body");
    textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
    });

    // Focus the title field
    document.getElementById("modal-entry-title").focus();

    // Cancel
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
    }, { once: true });

    // Escape key
    const escHandler = (e) => {
        if (e.key === "Escape") {
            closeModal();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);

    // Save
    document.getElementById("modal-save").addEventListener("click", async () => {
        const title = document.getElementById("modal-entry-title").value.trim();
        const body = document.getElementById("modal-entry-body").value.trim();

        if (!body) {
            document.getElementById("modal-entry-body").focus();
            return;
        }

        const saveBtn = document.getElementById("modal-save");
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            let entry;
            if (isEdit) {
                entry = await updateEntry(existingEntry.id, {
                    title,
                    body,
                    immich_asset_ids: assetIds,
                });
            } else {
                entry = await createEntry({
                    immich_asset_ids: assetIds,
                    title,
                    body,
                });
            }
            closeModal();
            window.location.hash = `#/entry/${entry.id}`;
        } catch (err) {
            saveBtn.disabled = false;
            saveBtn.textContent = isEdit ? "Save Changes" : "Save Entry";
            alert("Failed to save: " + err.message);
        }
    });
}

export function closeModal() {
    overlay.classList.add("hidden");
    container.innerHTML = "";
}
