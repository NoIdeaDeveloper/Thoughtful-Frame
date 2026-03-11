import { fetchEntries } from "../api.js";
import { renderEntryCard } from "../components/entryCard.js";

export async function renderFeed(container) {
    container.innerHTML = `
        <div class="feed-container">
            <h2 class="feed-header">My Journal</h2>
            <div class="feed-entries" id="feed-entries">
                ${skeletonCards(3)}
            </div>
            <div class="load-more-container hidden" id="feed-load-more">
                <button class="btn btn-secondary">Load more</button>
            </div>
        </div>
    `;

    let currentPage = 1;
    const pageSize = 20;
    const entriesEl = document.getElementById("feed-entries");
    const loadMoreEl = document.getElementById("feed-load-more");

    try {
        const data = await fetchEntries(currentPage, pageSize);

        entriesEl.innerHTML = "";

        // Handle various API response formats
        if (!data) {
            console.error("No data received from API");
            entriesEl.innerHTML = `
                <div class="error-state">
                    <p>No data received from server.</p>
                    <p>Please check your connection.</p>
                </div>
            `;
            return;
        }

        // Check if response has expected structure
        if (!data.entries || !Array.isArray(data.entries)) {
            console.error("Invalid API response structure:", data);
            entriesEl.innerHTML = `
                <div class="error-state">
                    <p>Received unexpected data format.</p>
                    <p>Response: ${JSON.stringify(data)}</p>
                </div>
            `;
            return;
        }

        // Handle single entry case
        if (data.entries.length === 1) {
        }

        if (data.entries.length === 0) {
            entriesEl.innerHTML = `
                <div class="empty-state">
                    <h2>Your journal is empty</h2>
                    <p>Browse your photos to start writing about your memories.</p>
                    <a href="#/browse" class="btn btn-primary">Browse Photos</a>
                </div>
            `;
            
            document.title = "Journal Empty - Thoughtful Frame";
            
            return;
        }

        for (const entry of data.entries) {
            try {
                const card = renderEntryCard(entry);
                entriesEl.appendChild(card);
            } catch (renderError) {
                console.error(`Failed to render entry ${entry.id}:`, renderError);
                // Skip this entry but continue with others
                continue;
            }
        }

        if (data.total > currentPage * pageSize) {
            loadMoreEl.classList.remove("hidden");
        }

        loadMoreEl.querySelector("button").addEventListener("click", async () => {
            currentPage++;
            const btn = loadMoreEl.querySelector("button");
            btn.textContent = "Loading...";
            btn.disabled = true;

            try {
                const moreData = await fetchEntries(currentPage, pageSize);
                for (const entry of moreData.entries) {
                    entriesEl.appendChild(renderEntryCard(entry));
                }
                btn.textContent = "Load more";
                btn.disabled = false;

                if (moreData.total <= currentPage * pageSize) {
                    loadMoreEl.classList.add("hidden");
                }
            } catch (err) {
                btn.textContent = "Load more";
                btn.disabled = false;
            }
        });
    } catch (err) {
        console.error("Failed to load journal entries:", err);
        entriesEl.innerHTML = `
            <div class="error-state">
                <p>Could not load journal entries.</p>
                <p>${err.message}</p>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 16px;">
                    Please check your connection and try refreshing the page.
                </p>
            </div>
        `;
    }
}

function skeletonCards(count) {
    return Array.from({ length: count })
        .map(
            () => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-thumb"></div>
            <div class="skeleton-body">
                <div class="skeleton skeleton-line short"></div>
                <div class="skeleton skeleton-line long"></div>
                <div class="skeleton skeleton-line medium"></div>
            </div>
        </div>
    `
        )
        .join("");
}
