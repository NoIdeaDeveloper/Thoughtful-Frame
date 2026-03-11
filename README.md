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

## 🚀 Beginner-Friendly Installation Guide

### Step-by-Step Setup (Unraid)

#### **1. Prepare Your System**
- ✅ **Requirements:** Unraid server with Docker enabled
- ✅ **Immich Server:** Must be running and accessible
- ✅ **Immich API Key:** Get this from Immich → Account Settings → API Keys

#### **2. Download the Project**
```bash
# Connect to your Unraid server via SSH or use the Unraid terminal
cd /mnt/user/appdata/
git clone https://github.com/your-repo/thoughtful-frame.git
cd thoughtful-frame
```

**Alternative:** Download the ZIP and extract to `/mnt/user/appdata/thoughtful-frame/`

#### **3. Configure Environment Variables**
```bash
# Copy the example configuration
cp .env.example .env

# Edit the .env file (use nano or your preferred editor)
nano .env
```

**Fill in these values:**
```env
# Your Immich server URL (use container name if on same Docker network)
IMMICH_BASE_URL=http://immich_server:2283/api

# Your Immich API key (from Immich Account Settings → API Keys)
IMMICH_API_KEY=your_api_key_here

# Leave this as-is for default database location
DATABASE_PATH=/data/thoughtful_frame.db
```

**Save the file:** Press `Ctrl+X`, then `Y`, then `Enter`

#### **4. Configure Immich Connection (Choose One Option)**

**Option A: Use Host Networking (Easiest - Recommended)**
```bash
# Edit docker-compose.yml
nano docker-compose.yml
```

Find the `networks:` section and replace it with:
```yaml
network_mode: host
```

Remove the entire `networks:` section at the bottom of the file.

**Option B: Use Immich's External URL**
If you prefer not to use host networking, use Immich's external URL:
```bash
# Edit your .env file
nano .env
```

Change `IMMICH_BASE_URL` to your Immich server's external URL:
```env
IMMICH_BASE_URL=http://your-unraid-ip:2283/api
```

Replace `your-unraid-ip` with your actual server IP (e.g., `192.168.1.100`).

**Option C: Use Docker Network (Advanced)**
Only if you specifically need container-to-container communication:
```bash
# Find your Immich network
docker network ls | grep immich

# Edit docker-compose.yml and set the correct network name
nano docker-compose.yml
```

#### **5. Start the Application**
```bash
# Build and start the container
docker compose up -d --build
```

Wait about 30 seconds for initialization...

#### **6. Access Thoughtful Frame**
Open your web browser and navigate to:
```
http://YOUR_UNRAID_IP:8421
```

Replace `YOUR_UNRAID_IP` with your Unraid server's local IP address.

#### **7. Verify It's Working**
```bash
# Check container status
docker ps

# View logs (helpful for troubleshooting)
docker logs thoughtful-frame

# Test the health endpoint
curl http://localhost:8421/api/health
```

### 🎯 Troubleshooting Tips

**Problem:** "Cannot reach Immich server"
- ❌ Check `IMMICH_BASE_URL` in your `.env` file
- ❌ If using host networking, ensure Immich is accessible on localhost
- ❌ If using external URL, verify the IP/port is correct
- ❌ Ensure Immich container is running (`docker ps`)

**Problem:** Database errors
- ❌ Check file permissions: `chmod -R 777 /mnt/user/appdata/thoughtful-frame/data`
- ❌ Verify `DATABASE_PATH` in `.env` points to writable location

**Problem:** Port conflicts
- ❌ Change host port in `docker-compose.yml` if 8421 is in use
- ❌ Restart container after changes: `docker compose restart`

### 📱 Using the Application

1. **Journal Tab** - View all your entries in chronological order
2. **Photos Tab** - Browse your Immich photo library
3. **Create Entries** - Click any photo or select multiple photos to write about
4. **Edit/Delete** - Click any entry to view full details and make changes

### 🔧 Updating the Application

```bash
# Stop the container
cd /mnt/user/appdata/thoughtful-frame
docker compose down

# Pull the latest changes
git pull

# Rebuild and restart
docker compose up -d --build
```

### 📊 Monitoring and Logs

Thoughtful Frame includes comprehensive logging to help troubleshoot issues:

```bash
# View real-time logs (follow)
docker logs -f thoughtful-frame

# View last 100 lines of logs
docker logs --tail 100 thoughtful-frame

# View logs with timestamps
docker logs -t thoughtful-frame

# Check container status
docker ps | grep thoughtful

# View resource usage (CPU, memory)
docker stats thoughtful-frame
```

**Log Features:**
- ✅ **Automatic log rotation** (10MB max, keeps 3 files)
- ✅ **Structured JSON format** for easy parsing
- ✅ **Access logs** for API request monitoring
- ✅ **Error logs** for database and Immich connection issues
- ✅ **Tagged logs** (`thoughtful-frame`) for easy filtering

**Common Log Messages:**
- `Database health check failed` - Database connection issues
- `Immich health check failed` - Cannot reach Immich server
- `404 Not Found` - Page or API endpoint not found
- `500 Internal Server Error` - Server-side errors

### 🛠️ Common Issues & Solutions

**Issue: "Cannot reach Immich server"**
```bash
# Check if Immich container is running
docker ps | grep immich

# Test network connectivity from Thoughtful Frame container
docker exec -it thoughtful-frame ping immich_server

# Verify .env configuration
cat .env | grep IMMICH_BASE_URL
```

**Issue: Database permission errors**
```bash
# Fix permissions
chmod -R 777 /mnt/user/appdata/thoughtful-frame/data

# Restart container
docker compose restart
```

**Issue: Port already in use**
```bash
# Find what's using port 8421
netstat -tulnp | grep 8421

# Change port in docker-compose.yml
# Before: - "8421:8000"
# After:  - "8422:8000"

# Recreate container
docker compose up -d --force-recreate
```
=======
=======

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

## 💻 Local Development Setup

### For Beginners: Step-by-Step

#### **1. Install Python**
- Download Python 3.12+ from [python.org](https://www.python.org/downloads/)
- Make sure to check "Add Python to PATH" during installation

#### **2. Set Up Virtual Environment**
```bash
# Create a virtual environment (isolates dependencies)
python -m venv .venv

# Activate it (Windows)\.venv\Scripts\activate

# Activate it (Mac/Linux)
source .venv/bin/activate
```

#### **3. Install Dependencies**
```bash
# Install required packages
pip install -r requirements.txt
```

#### **4. Configure Environment**
```bash
# Copy the example configuration
cp .env.example .env

# Edit .env file (use any text editor)
# Fill in your Immich server details
```

#### **5. Start Development Server**
```bash
# Run with auto-reload (changes apply immediately)
uvicorn backend.main:app --reload
```

#### **6. Access the Application**
Open your browser and visit: [http://localhost:8000](http://localhost:8000)

### 🎯 Development Tips

**Hot Reloading:** The server automatically restarts when you save files

**API Testing:** Try these endpoints:
- `GET /api/health` - Health check
- `GET /api/journal/entries` - List journal entries
- `POST /api/journal/entries` - Create new entry

**Debugging:**
```bash
# View Python logs
# They appear in your terminal where uvicorn is running

# Check installed packages
pip list

# Update dependencies
pip install -r requirements.txt --upgrade
```

**Common Issues:**
- **Port 8000 in use?** Change it: `uvicorn backend.main:app --port 8001 --reload`
- **Missing dependencies?** Run `pip install -r requirements.txt` again
- **Database errors?** Delete `thoughtful_frame.db` and restart
=======