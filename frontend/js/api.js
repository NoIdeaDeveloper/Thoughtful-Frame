const API_BASE = "/api";

export async function fetchAssets(page = 1, pageSize = 100) {
    const res = await fetch(`${API_BASE}/immich/assets?page=${page}&page_size=${pageSize}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function fetchAssetDetail(assetId) {
    const res = await fetch(`${API_BASE}/immich/assets/${assetId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export function thumbnailUrl(assetId) {
    return `${API_BASE}/immich/assets/${assetId}/thumbnail`;
}

export function originalUrl(assetId) {
    return `${API_BASE}/immich/assets/${assetId}/original`;
}

export async function fetchEntries(page = 1, pageSize = 20) {
    const res = await fetch(`${API_BASE}/journal/entries?page=${page}&page_size=${pageSize}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function fetchEntry(entryId) {
    const res = await fetch(`${API_BASE}/journal/entries/${entryId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function fetchEntriesForAsset(assetId) {
    const res = await fetch(`${API_BASE}/journal/entries/by-asset/${assetId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function createEntry(data) {
    const res = await fetch(`${API_BASE}/journal/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function updateEntry(entryId, data) {
    const res = await fetch(`${API_BASE}/journal/entries/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function deleteEntry(entryId) {
    const res = await fetch(`${API_BASE}/journal/entries/${entryId}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function checkAssetsWithEntries(assetIds) {
    const res = await fetch(`${API_BASE}/journal/entries/by-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_ids: assetIds }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return new Set(data.asset_ids_with_entries);
}
