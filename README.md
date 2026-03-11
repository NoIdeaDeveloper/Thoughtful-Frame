# Thoughtful Frame

A journaling app for your Immich photo library. Write thoughts, memories, and reflections about your photos — individually or as a group — stored in a private diary-style journal hosted on your local network.

---

## Features

- **Single-photo entries** — click any photo to write a journal entry about it
- **Group entries** — multi-select photos to write one entry covering a set of memories
- **Diary-style feed** — entries displayed chronologically, like a journal
- **Group photo display** — multi-photo entries show a horizontal scrollable row of images
- **Edit & delete** — update or remove entries at any time
- **Full-size view** — click any image in an entry for a full-screen lightbox
- **Secure** — your Immich API key stays server-side and is never exposed to the browser
- **Local-first** — runs entirely on your home network, no cloud required

---

## Requirements

- A running [Immich](https://immich.app) server (self-hosted, local network)
- An Immich API key (see below)
- Docker (for deployment)

### Generating an Immich API Key

1. Open your Immich web interface
2. Go to **Account Settings** (top-right avatar menu)
3. Select **API Keys** → **New API Key**
4. Name it (e.g. "Thoughtful Frame") and copy the key

---

## Deployment on Unraid

### Option A: Docker Compose (recommended)

**1.** Copy the project files to your Unraid server:
```bash
# On your local machine or via Unraid terminal
git clone <repo-url> /mnt/user/appdata/thoughtful-frame
cd /mnt/user/appdata/thoughtful-frame
```

**2.** Create your environment file:
```bash
cp .env.example .env
nano .env   # or edit with your preferred editor
```

Fill in the three values:
```
IMMICH_BASE_URL=http://immich_server:2283/api
IMMICH_API_KEY=your-key-here
DATABASE_PATH=/data/thoughtful_frame.db
```

> **`IMMICH_BASE_URL` tips:**
> - If Thoughtful Frame and Immich are on the **same Docker network**, use the Immich container name: `http://immich_server:2283/api`
> - If you're unsure, use your Unraid server's LAN IP: `http://192.168.1.x:2283/api`
> - Find the exact container name with `docker ps`

**3.** Set the Docker network name.

Thoughtful Frame must share a Docker network with Immich to communicate with it by container name. Find your Immich network:
```bash
docker network ls
# Look for something like "immich_default" or "immich-network"
```

Edit `docker-compose.yml` and replace `immich-network` under `networks:` with the correct name.

**4.** Build and start:
```bash
docker compose up -d --build
```

**5.** Open `http://<your-unraid-ip>:8421` in your browser.

---

### Option B: Unraid Docker Template (manual)

In the Unraid Docker tab, add a new container with these settings:

| Setting | Value |
|---|---|
| Repository | Build from this repo (or use image name if published) |
| Container Port | `8000` |
| Host Port | `8421` (or any open port) |
| Volume (container) | `/data` |
| Volume (host) | `/mnt/user/appdata/thoughtful-frame/data` |
| Env: `IMMICH_BASE_URL` | `http://immich_server:2283/api` |
| Env: `IMMICH_API_KEY` | Your Immich API key |
| Env: `DATABASE_PATH` | `/data/thoughtful_frame.db` |
| Network | Same network as your Immich container |

---

## How to Use

### Browsing Photos
Navigate to the **Photos** tab to see your entire Immich library in a grid.

- **Write about one photo:** Click any photo to open the journal entry editor
- **Write about multiple photos:** Click **"Select Multiple"**, check the photos you want, then click **"Write Entry"** in the bar that appears at the bottom

### Writing an Entry
The editor shows a preview of your selected photo(s) at the top.

- **Title** — optional, a short label for the memory
- **Your thoughts** — the main journal text (auto-resizes as you type)
- Click **Save Entry** to save, or **Cancel** to discard

### Reading Your Journal
The **Journal** tab shows all entries in reverse chronological order (newest first).

- Single-photo entries show the photo on the left, text on the right
- Group entries show a scrollable row of thumbnails above the text
- Click any entry card to open the full detail view

### Entry Detail View
- Images are displayed at full size (single) or as a scrollable row (group)
- Click any image in a group entry for a full-screen lightbox view
- Use **Edit** to change the title, body, or even swap photos
- Use **Delete** to remove the entry (with confirmation)

---

## Health Check

The app exposes a health endpoint you can use to verify connectivity:

```
GET /api/health
```

Response:
```json
{
  "healthy": true,
  "database": "ok",
  "immich": "ok"
}
```

If `immich` reports an error, check your `IMMICH_BASE_URL` and that the containers share a network.

---

## Local Development

```bash
# Clone and set up
git clone <repo-url>
cd thoughtful-frame

# Create virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Immich server URL and API key

# Run the development server
uvicorn backend.main:app --reload

# Open http://localhost:8000
```

The SQLite database is created automatically at the path set in `DATABASE_PATH` (defaults to `/data/thoughtful_frame.db` — you may want to change this to a local path during development, e.g. `./thoughtful_frame.db`).

---

## Project Structure

```
Thoughtful Frame/
├── backend/
│   ├── main.py              # FastAPI app, serves frontend
│   ├── config.py            # Environment variable loading
│   ├── database.py          # SQLite schema and connection
│   ├── models.py            # Pydantic request/response models
│   ├── immich_client.py     # Immich API client (keeps API key server-side)
│   └── routes/
│       ├── journal.py       # Journal entry CRUD endpoints
│       └── immich_proxy.py  # Proxy for Immich images and metadata
└── frontend/
    ├── index.html           # Single-page app shell
    ├── css/style.css        # Journal/diary aesthetic styles
    └── js/
        ├── app.js           # Hash-based router
        ├── api.js           # Backend API fetch wrappers
        ├── views/           # feed.js, browse.js, entry.js
        └── components/      # entryCard.js, photoGrid.js, modal.js
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (no frameworks) |
| Backend | Python 3.12, FastAPI |
| Database | SQLite (via aiosqlite) |
| HTTP client | httpx (async) |
| Deployment | Docker, Docker Compose |
