import { fetchEntry, deleteEntry, originalUrl, thumbnailUrl } from "../api.js";
import { formatDate, escapeHtml } from "../utils.js";
import { showEntryModal } from "../components/modal.js";

// Auto-sliding gallery function (defined before use)
function setupAutoSlidingGallery(photosContainer, autoSlide = true) {
    // Set up auto-sliding gallery for multi-photo entries
    try {
        // Configuration
        const slideInterval = 5000; // 5 seconds between slides
        const slideDistance = 300; // pixels to slide
        const pauseOnHover = true;
        
        let slideIntervalId = null;
        let isPaused = false;
        let currentPosition = 0;
        
        // Only set up sliding if there are multiple images
        const images = photosContainer.querySelectorAll("img");
        if (images.length <= 1) {
            return;
        }
        
        // Add gallery controls
        const controls = document.createElement("div");
        controls.className = "gallery-controls";
        controls.innerHTML = `
            <button class="gallery-control pause" title="Pause">⏸️</button>
            <button class="gallery-control play hidden" title="Play">▶️</button>
            <button class="gallery-control prev" title="Previous">⬅️</button>
            <button class="gallery-control next" title="Next">➡️</button>
        `;
        
        // Insert controls after the photos container
        photosContainer.parentNode.insertBefore(controls, photosContainer.nextSibling);
        
        // Style the gallery container for sliding
        photosContainer.style.overflow = "hidden";
        photosContainer.style.position = "relative";
        
        // Create a wrapper for the images
        const imagesWrapper = document.createElement("div");
        imagesWrapper.className = "images-wrapper";
        imagesWrapper.style.display = "flex";
        imagesWrapper.style.transition = "transform 0.5s ease-in-out";
        imagesWrapper.style.width = "fit-content";
        
        // Move images into wrapper
        while (photosContainer.firstChild) {
            imagesWrapper.appendChild(photosContainer.firstChild);
        }
        photosContainer.appendChild(imagesWrapper);
        
        // Control functions
        function startSliding() {
            if (slideIntervalId || isPaused) return;
            
            slideIntervalId = setInterval(() => {
                if (isPaused) return;
                
                const maxScroll = imagesWrapper.scrollWidth - photosContainer.clientWidth;
                currentPosition += slideDistance;
                
                if (currentPosition >= maxScroll) {
                    currentPosition = 0; // Loop back to start
                }
                
                imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
            }, slideInterval);
        }
        
        function stopSliding() {
            if (slideIntervalId) {
                clearInterval(slideIntervalId);
                slideIntervalId = null;
            }
        }
        
        function pauseSliding() {
            isPaused = true;
        }
        
        function resumeSliding() {
            isPaused = false;
            if (!slideIntervalId) {
                startSliding();
            }
        }
        
        function slideTo(position) {
            currentPosition = position;
            imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
        }
        
        function nextSlide() {
            const maxScroll = imagesWrapper.scrollWidth - photosContainer.clientWidth;
            currentPosition += slideDistance;
            if (currentPosition >= maxScroll) {
                currentPosition = 0;
            }
            imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
        }
        
        function prevSlide() {
            currentPosition -= slideDistance;
            if (currentPosition < 0) {
                currentPosition = imagesWrapper.scrollWidth - photosContainer.clientWidth;
            }
            imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
        }
        
        // Event listeners for controls
        controls.querySelector(".pause").addEventListener("click", () => {
            pauseSliding();
            controls.querySelector(".pause").classList.add("hidden");
            controls.querySelector(".play").classList.remove("hidden");
        });
        
        controls.querySelector(".play").addEventListener("click", () => {
            resumeSliding();
            controls.querySelector(".play").classList.add("hidden");
            controls.querySelector(".pause").classList.remove("hidden");
        });
        
        controls.querySelector(".prev").addEventListener("click", prevSlide);
        controls.querySelector(".next").addEventListener("click", nextSlide);
        
        // Pause on hover
        if (pauseOnHover) {
            photosContainer.addEventListener("mouseenter", pauseSliding);
            photosContainer.addEventListener("mouseleave", resumeSliding);
        }
        
        // Start sliding automatically if enabled
        if (autoSlide) {
            startSliding();
        } else {
            // If auto-slide is disabled, show play button by default
            controls.querySelector(".pause").classList.add("hidden");
            controls.querySelector(".play").classList.remove("hidden");
        }
        
        // Cleanup on page navigation
        window.addEventListener("beforeunload", stopSliding);
        
        // Store cleanup function for manual cleanup
        photosContainer._cleanupGallery = () => {
            stopSliding();
            const controls = photosContainer.nextElementSibling;
            if (controls && controls.className === "gallery-controls") {
                controls.querySelector(".pause")?.removeEventListener("click", pauseSliding);
                controls.querySelector(".play")?.removeEventListener("click", resumeSliding);
                controls.querySelector(".prev")?.removeEventListener("click", prevSlide);
                controls.querySelector(".next")?.removeEventListener("click", nextSlide);
                photosContainer.removeEventListener("mouseenter", pauseSliding);
                photosContainer.removeEventListener("mouseleave", resumeSliding);
            }
            window.removeEventListener("beforeunload", stopSliding);
        };
        
    } catch (error) {
        // Error is silently caught to allow graceful degradation
    }
}

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
        // Clean up any existing gallery from previous entry
        const existingGallery = document.querySelector(".entry-detail-photos.multi");
        if (existingGallery && existingGallery._cleanupGallery) {
            existingGallery._cleanupGallery();
        }
        
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
                    <img src="${originalUrl(entry.immich_asset_ids[0])}" alt="Photo" data-asset-id="${entry.immich_asset_ids[0]}">
                </div>
            `;
        }

        container.innerHTML = `
            <div class="entry-detail">
                ${photosHtml}
                <div id="image-load-errors" style="color: var(--accent); margin: 10px 0; display: none;">
                    Some images failed to load. <button id="retry-images" class="btn btn-small">Retry</button>
                </div>
                ${entry.title ? `<h2 class="entry-detail-title">${escapeHtml(entry.title)}</h2>` : ""}
                <div class="entry-detail-date">
                    ${formatDate(entry.created_at)}
                    ${entry.updated_at !== entry.created_at ? ` (edited ${formatDate(entry.updated_at)})` : ""}
                </div>
                <div class="entry-detail-body">${escapeHtml(entry.body)}</div>
                <div class="entry-detail-actions">
                    <button class="btn btn-secondary" id="entry-edit">Edit</button>
                    <button class="btn btn-danger" id="entry-delete">Delete</button>
                    <a href="#/" class="btn btn-secondary">Back to Journal</a>
                </div>
            </div>
        `;

        // Add error handling for image loading
        const errorHandler = (img) => {
            return () => {
                const errorDiv = document.getElementById("image-load-errors");
                if (errorDiv) {
                    errorDiv.style.display = "block";
                }
                // Fallback to thumbnail if original fails
                img.src = thumbnailUrl(img.dataset.assetId);
                // Remove error handler to prevent infinite loops
                img.onerror = null;
            };
        };

        // Add event listeners for all images
        container.querySelectorAll("img").forEach((img) => {
            if (img.dataset.assetId) {
                img.onerror = errorHandler(img);
            }
        });

        // Retry button
        const retryBtn = document.getElementById("retry-images");
        if (retryBtn) {
            retryBtn.addEventListener("click", () => {
                window.location.reload();
            });
        }

        // Auto-sliding gallery for multi-photo entries
        if (isMulti) {
            const photosContainer = container.querySelector(".entry-detail-photos.multi");
            if (photosContainer) {
                // Check if auto-sliding is enabled (default to true)
                const autoSlideEnabled = localStorage.getItem("autoSlideEnabled");
                const shouldAutoSlide = autoSlideEnabled !== "false"; // Default to true
                setupAutoSlidingGallery(photosContainer, shouldAutoSlide);
            }
            
            // Lightbox functionality
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

    const clickHandler = () => lightbox.remove();
    lightbox.addEventListener("click", clickHandler, { once: true });

    const keyHandler = (e) => {
        if (e.key === "Escape") {
            lightbox.remove();
        }
    };
    document.addEventListener("keydown", keyHandler, { once: true });

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

export function showRemoveImagesModal(entryId, currentAssetIds) {
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


function setupAutoSlidingGallery(photosContainer, autoSlide = true) {
    // Set up auto-sliding gallery for multi-photo entries
    try {
        // Configuration
        const slideInterval = 5000; // 5 seconds between slides
        const slideDistance = 300; // pixels to slide
        const pauseOnHover = true;
        
        let slideIntervalId = null;
        let isPaused = false;
        let currentPosition = 0;
        
        // Only set up sliding if there are multiple images
        const images = photosContainer.querySelectorAll("img");
        if (images.length <= 1) {
            return;
        }
        
        // Add gallery controls
        const controls = document.createElement("div");
        controls.className = "gallery-controls";
        controls.innerHTML = `
            <button class="gallery-control pause" title="Pause">⏸️</button>
            <button class="gallery-control play hidden" title="Play">▶️</button>
            <button class="gallery-control prev" title="Previous">⬅️</button>
            <button class="gallery-control next" title="Next">➡️</button>
        `;
        
        // Insert controls after the photos container
        photosContainer.parentNode.insertBefore(controls, photosContainer.nextSibling);
        
        // Style the gallery container for sliding
        photosContainer.style.overflow = "hidden";
        photosContainer.style.position = "relative";
        
        // Create a wrapper for the images
        const imagesWrapper = document.createElement("div");
        imagesWrapper.className = "images-wrapper";
        imagesWrapper.style.display = "flex";
        imagesWrapper.style.transition = "transform 0.5s ease-in-out";
        imagesWrapper.style.width = "fit-content";
        
        // Move images into wrapper
        while (photosContainer.firstChild) {
            imagesWrapper.appendChild(photosContainer.firstChild);
        }
        photosContainer.appendChild(imagesWrapper);
        
        // Control functions
        function startSliding() {
            if (slideIntervalId || isPaused) return;
            
            slideIntervalId = setInterval(() => {
                if (isPaused) return;
                
                const maxScroll = imagesWrapper.scrollWidth - photosContainer.clientWidth;
                currentPosition += slideDistance;
                
                if (currentPosition >= maxScroll) {
                    currentPosition = 0; // Loop back to start
                }
                
                imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
            }, slideInterval);
            

        }
        
        function stopSliding() {
            if (slideIntervalId) {
                clearInterval(slideIntervalId);
                slideIntervalId = null;
            }
        }
        
        function pauseSliding() {
            isPaused = true;
        }
        
        function resumeSliding() {
            isPaused = false;
            if (!slideIntervalId) {
                startSliding();
            }
        }
        
        function slideTo(position) {
            currentPosition = position;
            imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
        }
        
        function nextSlide() {
            const maxScroll = imagesWrapper.scrollWidth - photosContainer.clientWidth;
            currentPosition += slideDistance;
            if (currentPosition >= maxScroll) {
                currentPosition = 0;
            }
            imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
        }
        
        function prevSlide() {
            currentPosition -= slideDistance;
            if (currentPosition < 0) {
                currentPosition = imagesWrapper.scrollWidth - photosContainer.clientWidth;
            }
            imagesWrapper.style.transform = `translateX(-${currentPosition}px)`;
        }
        
        // Event listeners for controls
        controls.querySelector(".pause").addEventListener("click", () => {
            pauseSliding();
            controls.querySelector(".pause").classList.add("hidden");
            controls.querySelector(".play").classList.remove("hidden");
        });
        
        controls.querySelector(".play").addEventListener("click", () => {
            resumeSliding();
            controls.querySelector(".play").classList.add("hidden");
            controls.querySelector(".pause").classList.remove("hidden");
        });
        
        controls.querySelector(".prev").addEventListener("click", prevSlide);
        controls.querySelector(".next").addEventListener("click", nextSlide);
        
        // Pause on hover
        if (pauseOnHover) {
            photosContainer.addEventListener("mouseenter", pauseSliding);
            photosContainer.addEventListener("mouseleave", resumeSliding);
        }
        
        // Start sliding automatically if enabled
        if (autoSlide) {
            startSliding();
        } else {
            // If auto-slide is disabled, show play button by default
            controls.querySelector(".pause").classList.add("hidden");
            controls.querySelector(".play").classList.remove("hidden");
        }
        
        // Cleanup on page navigation
        window.addEventListener("beforeunload", stopSliding);
        
        // Store cleanup function for manual cleanup
        photosContainer._cleanupGallery = () => {
            stopSliding();
            const controls = photosContainer.nextElementSibling;
            if (controls && controls.className === "gallery-controls") {
                controls.querySelector(".pause")?.removeEventListener("click", pauseSliding);
                controls.querySelector(".play")?.removeEventListener("click", resumeSliding);
                controls.querySelector(".prev")?.removeEventListener("click", prevSlide);
                controls.querySelector(".next")?.removeEventListener("click", nextSlide);
                photosContainer.removeEventListener("mouseenter", pauseSliding);
                photosContainer.removeEventListener("mouseleave", resumeSliding);
            }
            window.removeEventListener("beforeunload", stopSliding);
        };
        
    } catch (error) {
        // Error is silently caught to allow graceful degradation
    }
}}