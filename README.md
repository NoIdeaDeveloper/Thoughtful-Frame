# Thoughtful Frame

A journaling app for your Immich photo library

## Features

- Write journal entries about individual photos or groups of photos
- Browse your Immich photo library in a grid layout
- Multi-select photos to write a single group journal entry
- Chronological journal feed (diary-style)
- Group entries display a horizontal scrollable row of photos
- Edit and delete entries at any time
- Immich API key stays server-side (never exposed to browser)

## Requirements

- Running Immich server (local network, self-hosted)
- Immich API key (Immich → Account Settings → API Keys)
- Docker

## Deployment on Unraid

### Step-by-step:

1. Clone/copy project files to Unraid (e.g. `/mnt/user/appdata/thoughtful-frame`)
2. Copy `.env.example` to `.env` and fill in:
   - `IMMICH_BASE_URL` — internal URL of Immich, e.g. `http://immich_server:2283/api` (use container name if on same Docker network) or `http://192.168.1.x:2283/api`
   - `IMMICH_API_KEY` — from Immich Account Settings → API Keys
   - `DATABASE_PATH` — leave as `/data/thoughtful_frame.db`
3. **Important network step:** The container must share a Docker network with Immich. Find the network name with `docker network ls`. Edit `docker-compose.yml` to match the network name.
4. `docker compose up -d --build`
5. Access at `http://<unraid-ip>:8421`

### Unraid Docker Template alternative:

- Container Port: 8000
- Host Port: 8421
- Volume: `/data` → `/mnt/user/appdata/thoughtful-frame/data`
- Set environment variables as above

## How to Use

- **Journal tab** — chronological feed of all entries
- **Photos tab** — browse Immich library
  - Click a photo → write a single-photo entry
  - Click "Select Multiple" → check photos → "Write Entry" for a group
- **Writing** — optional title + your thoughts → Save
- **Entry detail** — click any feed card → full view with Edit/Delete
- **Multi-photo entries** — horizontal scrollable row; click any image for full-screen

## Health Check

`GET /api/health` returns `{ healthy, database, immich }` status

## Local Development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn backend.main:app --reload
# visit http://localhost:8000
```