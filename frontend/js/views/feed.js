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

        if (data.entries.length === 0) {
            entriesEl.innerHTML = `
                <div class="empty-state">
                    <h2>Your journal is empty</h2>
                    <p>Browse your photos to start writing about your memories.</p>
                    <a href="#/browse" class="btn btn-primary">Browse Photos</a>
                </div>
            `;
            return;
        }

        for (const entry of data.entries) {
            entriesEl.appendChild(renderEntryCard(entry));
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

                if (data.total <= currentPage * pageSize) {
                    loadMoreEl.classList.add("hidden");
                }
            } catch (err) {
                btn.textContent = "Load more";
                btn.disabled = false;
            }
        });
    } catch (err) {
        entriesEl.innerHTML = `
            <div class="error-state">
                <p>Could not load journal entries.</p>
                <p>${err.message}</p>
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
