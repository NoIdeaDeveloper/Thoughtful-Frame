import { renderFeed } from "./views/feed.js";
import { renderBrowse } from "./views/browse.js";
import { renderEntry } from "./views/entry.js";
import { renderSettings } from "./views/settings.js";
import { getSettings } from "./api.js";

const contentEl = document.getElementById("app-content");

// Apply theme immediately from localStorage to avoid flash, then reconcile with API
export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
}

applyTheme(localStorage.getItem("theme") || "dark");

getSettings().then((settings) => {
    if (settings.theme) applyTheme(settings.theme);
}).catch(() => {});

function route() {
    const hash = window.location.hash || "#/";
    const parts = hash.slice(2).split("/");

    if (parts[0] === "" || parts[0] === undefined) {
        renderFeed(contentEl);
    } else if (parts[0] === "browse") {
        renderBrowse(contentEl);
    } else if (parts[0] === "entry" && parts[1]) {
        renderEntry(contentEl, parseInt(parts[1], 10));
    } else if (parts[0] === "settings") {
        renderSettings(contentEl);
    }

    // Update active nav link
    document.querySelectorAll(".nav-link").forEach((link) => {
        const view = link.dataset.view;
        const isActive =
            (view === "feed" && (hash === "#/" || hash === "#")) ||
            (view === "browse" && hash.startsWith("#/browse")) ||
            (view === "settings" && hash.startsWith("#/settings"));
        link.classList.toggle("active", isActive);
    });
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
