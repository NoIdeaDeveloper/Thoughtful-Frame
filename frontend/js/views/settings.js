import { getSettings, updateSettings } from "../api.js";
import { applyTheme } from "../app.js";

export async function renderSettings(container) {
    container.innerHTML = `
        <div class="settings-page">
            <h1 class="settings-title">Settings</h1>
            <div class="settings-section">
                <h2 class="settings-section-title">Appearance</h2>
                <div class="setting-item">
                    <label class="setting-label">
                        <span class="setting-description">
                            <strong>Theme</strong>
                            <span class="setting-subtext">Choose between dark and light mode</span>
                        </span>
                    </label>
                    <div class="theme-toggle-group">
                        <button class="theme-btn" id="theme-dark">Dark</button>
                        <button class="theme-btn" id="theme-light">Light</button>
                    </div>
                </div>
            </div>
            <div class="settings-section">
                <h2 class="settings-section-title">Gallery Settings</h2>
                <div class="setting-item">
                    <label class="setting-label">
                        <input type="checkbox" id="auto-slide-toggle" class="setting-toggle">
                        <span class="setting-description">
                            <strong>Auto-sliding Gallery</strong>
                            <span class="setting-subtext">Automatically slide through multiple images in journal entries</span>
                        </span>
                    </label>
                </div>
            </div>
            <div class="settings-section">
                <h2 class="settings-section-title">Data</h2>
                <div class="setting-item">
                    <span class="setting-description">
                        <strong>Export Journal</strong>
                        <span class="setting-subtext">Download all journal entries as a JSON file</span>
                    </span>
                    <a href="/api/journal/export" download class="btn btn-secondary">Export</a>
                </div>
                <div class="setting-item" style="margin-top: 12px;">
                    <span class="setting-description">
                        <strong>Import Journal</strong>
                        <span class="setting-subtext">Restore entries from a previously exported JSON file</span>
                    </span>
                    <label class="btn btn-secondary" style="cursor: pointer;">
                        Import
                        <input type="file" id="import-file" accept=".json" style="display: none;">
                    </label>
                </div>
                <div id="import-status" style="margin-top: 8px; font-size: 0.85rem;"></div>
            </div>
            <div class="settings-section">
                <h2 class="settings-section-title">About</h2>
                <p class="settings-about">Thoughtful Frame - A journaling app for your photos and memories.</p>
                <p class="settings-version">Version 1.0.0</p>
            </div>
        </div>
    `;

    try {
        const settings = await getSettings();

        // Theme toggle
        const currentTheme = settings.theme || "dark";
        updateThemeButtons(currentTheme);

        async function saveTheme(theme) {
            applyTheme(theme);
            updateThemeButtons(theme);
            try {
                await updateSettings({ auto_slide_gallery: document.getElementById("auto-slide-toggle").checked, theme });
            } catch (err) {
                console.error("Failed to save theme:", err);
            }
        }

        function updateThemeButtons(theme) {
            document.getElementById("theme-dark").classList.toggle("active", theme === "dark");
            document.getElementById("theme-light").classList.toggle("active", theme === "light");
        }

        document.getElementById("theme-dark").addEventListener("click", () => saveTheme("dark"));
        document.getElementById("theme-light").addEventListener("click", () => saveTheme("light"));

        // Auto-slide toggle
        const autoSlideEnabled = settings.auto_slide_gallery ?? true;
        document.getElementById("auto-slide-toggle").checked = autoSlideEnabled;

        document.getElementById("auto-slide-toggle").addEventListener("change", async (e) => {
            const isEnabled = e.target.checked;
            localStorage.setItem("autoSlideEnabled", isEnabled.toString());
            try {
                await updateSettings({ auto_slide_gallery: isEnabled, theme: settings.theme || "dark" });
                showSaved(e.target);
            } catch (error) {
                console.error("Failed to update settings:", error);
                e.target.checked = !isEnabled;
            }
        });

    } catch (error) {
        console.error("Failed to load settings:", error);

        // Fallback: apply theme buttons from localStorage
        const localTheme = localStorage.getItem("theme") || "dark";
        document.getElementById("theme-dark").classList.toggle("active", localTheme === "dark");
        document.getElementById("theme-light").classList.toggle("active", localTheme === "light");

        document.getElementById("theme-dark").addEventListener("click", () => applyTheme("dark"));
        document.getElementById("theme-light").addEventListener("click", () => applyTheme("light"));

        const savedPreference = localStorage.getItem("autoSlideEnabled");
        if (savedPreference !== null) {
            document.getElementById("auto-slide-toggle").checked = savedPreference === "true";
        }
    }

    // Import handler
    document.getElementById("import-file").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById("import-status");
        statusEl.textContent = "Importing...";
        statusEl.style.color = "var(--text-muted)";

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const res = await fetch("/api/journal/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error(await res.text());
            const result = await res.json();
            statusEl.textContent = `Imported ${result.imported} entries successfully.`;
            statusEl.style.color = "var(--accent)";
        } catch (err) {
            statusEl.textContent = "Import failed: " + err.message;
            statusEl.style.color = "#c0392b";
        }

        // Reset file input so same file can be re-imported
        e.target.value = "";
    });
}

function showSaved(toggleEl) {
    toggleEl.disabled = true;
    const msg = document.createElement("span");
    msg.textContent = toggleEl.checked ? "Enabled" : "Disabled";
    msg.className = "setting-saved";
    msg.style.marginLeft = "10px";
    toggleEl.parentNode.appendChild(msg);
    setTimeout(() => {
        toggleEl.disabled = false;
        msg.remove();
    }, 1500);
}
