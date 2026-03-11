import { getSettings, updateSettings } from "../api.js";

export async function renderSettings(container) {
    container.innerHTML = `
        <div class="settings-page">
            <h1 class="settings-title">Settings</h1>
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
                <h2 class="settings-section-title">About</h2>
                <p class="settings-about">Thoughtful Frame - A journaling app for your photos and memories.</p>
                <p class="settings-version">Version 1.0.0</p>
            </div>
        </div>
    `;

    try {
        // Load current settings
        const settings = await getSettings();
        const autoSlideEnabled = settings.auto_slide_gallery ?? true; // Default to true
        
        document.getElementById("auto-slide-toggle").checked = autoSlideEnabled;
        
        // Add event listener for toggle
        document.getElementById("auto-slide-toggle").addEventListener("change", async (e) => {
            const isEnabled = e.target.checked;
            
            try {
                await updateSettings({ auto_slide_gallery: isEnabled });
                
                // Update localStorage to reflect the change immediately
                localStorage.setItem("autoSlideEnabled", isEnabled.toString());
                
                // Show confirmation
                const toggle = e.target;
                const originalChecked = toggle.checked;
                toggle.disabled = true;
                
                const confirmation = document.createElement("span");
                confirmation.textContent = isEnabled ? "Enabled" : "Disabled";
                confirmation.className = "setting-saved";
                confirmation.style.marginLeft = "10px";
                
                toggle.parentNode.appendChild(confirmation);
                
                setTimeout(() => {
                    toggle.disabled = false;
                    confirmation.remove();
                }, 1500);
                
            } catch (error) {
                console.error("Failed to update settings:", error);
                // Revert the toggle if update failed
                e.target.checked = !isEnabled;
                
                // Show user-friendly error message
                const errorMsg = error.message.includes("Failed to save") 
                    ? error.message 
                    : "Failed to save settings. Please check your connection and try again.";
                
                const errorElement = document.createElement("div");
                errorElement.className = "settings-error";
                errorElement.style.color = "#c0392b";
                errorElement.style.marginTop = "8px";
                errorElement.style.fontSize = "0.85rem";
                errorElement.textContent = errorMsg;
                
                // Remove any existing error message
                const existingError = document.querySelector(".settings-error");
                if (existingError) existingError.remove();
                
                toggle.parentNode.appendChild(errorElement);
                
                // Re-enable the toggle
                toggle.disabled = false;
                
                // Auto-remove error after 5 seconds
                setTimeout(() => {
                    errorElement.remove();
                }, 5000);
            }
        });
        
    } catch (error) {
        console.error("Failed to load settings:", error);
        
        // Show user-friendly error message
        const errorMessage = document.createElement("div");
        errorMessage.className = "error-message";
        errorMessage.style.color = "var(--accent)";
        errorMessage.style.margin = "16px 0";
        errorMessage.style.padding = "12px";
        errorMessage.style.background = "rgba(139, 115, 85, 0.1)";
        errorMessage.style.borderRadius = "var(--radius)";
        errorMessage.textContent = "Could not load settings. Using local preferences. Some features may be limited.";
        
        const settingsTitle = document.querySelector(".settings-title");
        if (settingsTitle) {
            settingsTitle.parentNode.insertBefore(errorMessage, settingsTitle.nextSibling);
        }
        
        // Use localStorage fallback if API fails
        const savedPreference = localStorage.getItem("autoSlideEnabled");
        if (savedPreference !== null) {
            document.getElementById("auto-slide-toggle").checked = savedPreference === "true";
        }
    }
}