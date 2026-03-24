# Start from scratch — local server, Expo app, and Railway

Use this after closing terminals and browsers. Do steps **in order**.

---

## Part A — One-time: accounts & keys

1. **GitHub** — Your project code is in a repo you can push to (for Railway).
2. **OpenAI** — API key: [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
3. **Google Cloud** — Places API key: [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) (enable Places API New + legacy Places as needed).
4. **Unsplash** — [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications)  
   - Create an app.  
   - Copy **Access Key** and **Secret Key** — you only put the **Access Key** in env vars for this server (Search API uses `Client-ID` + Access Key). **Do not** put the Secret in `UNSPLASH_ACCESS_KEY` or use it as `Client-ID`.

---

## Part B — Open the project on your Mac

1. Open **Terminal** (or Cursor’s terminal).
2. Go to the project:
   ```bash
   cd /Users/drewauster/whats-the-move
   ```
3. **Install app dependencies** (if you haven’t or after a fresh clone):
   ```bash
   npm install
   ```
4. **Install server dependencies**:
   ```bash
   cd server && npm install && cd ..
   ```

---

## Part C — Environment files (two places)

There are **two** `.env` files. Both matter for different things.

### 1) `whats-the-move/server/.env` (API server)

Create or edit **`server/.env`** (copy from `server/.env.example` if needed). Set at minimum:

| Variable | What to put |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI key |
| `GOOGLE_PLACES_API_KEY` | Your Google Places key |
| `UNSPLASH_ACCESS_KEY` | Unsplash **Access Key** only (same string as in the Unsplash dashboard “Access Key”) |
| `EXPO_PUBLIC_UNSPLASH_ACCESS_KEY` | **Same** Access Key (optional duplicate; do **not** use Secret here) |

Optional: Ticketmaster / showtimes if you use them.

**Never commit** `.env` to git (keep it in `.gitignore`).

### 2) `whats-the-move/.env` (Expo / Metro — what the **phone app** reads)

Create or edit **project root** `.env`:

| Variable | What to put |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Where the app should call the API (see Part E) |

Other keys in root `.env` are only needed if your Expo bundle reads them; the **Node server** primarily uses **`server/.env`**.

---

## Part D — Run the API locally

1. In Terminal:
   ```bash
   cd /Users/drewauster/whats-the-move/server
   npm start
   ```
   You should see: `AI move server listening on 3001` and “Try:” URLs.

2. Leave this terminal **open** while testing locally.

3. In a **browser**, check (replace nothing if you use default port):

   | URL | What you should see |
   |-----|---------------------|
   | `http://localhost:3001/health` | `{"ok":true}` |
   | `http://localhost:3001/` | `"ok": true`, `"service": "whats-the-move"`, `"photoPipeline": "unsplash-editorial-v1"` |
   | `http://localhost:3001/api-status` | Keys status + `unsplashEnv` + `photoPipeline` |
   | `http://localhost:3001/unsplash-ping` | `"ok": true`, `"httpStatus": 200` if Unsplash Access Key is correct |

If **`/`** does **not** show `photoPipeline`, you’re not running the current `server` code from this repo.

---

## Part E — Point the Expo app at your API

The app uses **`EXPO_PUBLIC_API_URL`** from the **root** `.env` (Expo reads this at bundle time).

### Option 1 — Simulator on the same Mac

Root `.env`:
```env
EXPO_PUBLIC_API_URL=http://localhost:3001
```

### Option 2 — Physical phone on same Wi‑Fi

`localhost` on the phone is **not** your Mac. Use your Mac’s LAN IP, e.g.:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.98:3001
```

(Find IP: System Settings → Network, or `ipconfig getifaddr en0` in Terminal.)

After **any** change to root `.env`:

```bash
cd /Users/drewauster/whats-the-move
npx expo start -c
```

`-c` clears the Metro cache so the URL updates.

---

## Part F — Run the mobile app

1. **New terminal tab** (keep `npm start` in `server/` running if testing local API).
2. From project root:
   ```bash
   cd /Users/drewauster/whats-the-move
   npx expo start -c
   ```
3. Scan QR with **Expo Go** (iOS) or open simulator.

**Checklist:**  
- If `EXPO_PUBLIC_API_URL` is local → server must be running (`npm start` in `server/`).  
- If `EXPO_PUBLIC_API_URL` is Railway → phone must have internet; **no** local server needed for API.

---

## Part G — Deploy to Railway (production API)

### 1) Push code

```bash
cd /Users/drewauster/whats-the-move
git add -A
git status   # confirm .env files are NOT staged
git commit -m "Deploy server"
git push
```

**Do not** push `server/.env` or root `.env` if they contain secrets.

### 2) Railway project

1. [railway.app](https://railway.app) → your project → **the service** that runs the Node API.
2. **Settings → Build / Source → Root Directory** = **`server`** (required).  
   If this is wrong, Railway may run the **Expo** `npm start` from the repo root instead of the API.
3. **Start Command** can be empty; `server/package.json` uses `npm start` → `node --import ./load-env.js index.js`.

### 3) Railway variables

In **Variables**, add the **same** values as in `server/.env`, but paste into the Railway UI (Railway does **not** read your laptop’s `server/.env`):

- `OPENAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `UNSPLASH_ACCESS_KEY` = Unsplash **Access Key** only
- Optionally `EXPO_PUBLIC_UNSPLASH_ACCESS_KEY` = same Access Key (not Secret)

### 4) Deploy

- **Deploy** / wait for build to finish.

### 5) Verify production (replace with your URL)

| URL | Expected |
|-----|----------|
| `https://YOUR-APP.up.railway.app/` | `"ok": true`, `"photoPipeline": "unsplash-editorial-v1"` |
| `https://YOUR-APP.up.railway.app/unsplash-ping` | `"ok": true`, `"httpStatus": 200` — **not** `Cannot GET` |
| `https://YOUR-APP.up.railway.app/place-photo?q=museum&sourceName=Test&area=Los%20Angeles` | `photoUrl` should be an **Unsplash** URL, not `googleusercontent` |

If you still see **only** `{ "openai":"OK", "google":"OK", ... }` at **`/`** with **no** `ok` / `photoPipeline`, the live deploy is **not** this repo’s current server — fix Root Directory = `server` and redeploy latest commit.

---

## Part H — Use production from the phone app

1. In **root** `.env`:
   ```env
   EXPO_PUBLIC_API_URL=https://YOUR-APP.up.railway.app
   ```
   (No trailing slash.)

2. Restart Expo with cache clear:
   ```bash
   npx expo start -c
   ```

---

## Quick troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| `Cannot GET /unsplash-ping` on Railway | Old deploy or wrong Root Directory — not latest `server` code |
| `/` on Railway has no `photoPipeline` | Same as above |
| Unsplash dashboard **0** requests | Old server (no Unsplash routes) **or** wrong key (Secret instead of Access) **or** no traffic yet |
| `401` on `/unsplash-ping` | Wrong key — use **Access Key** only |
| App can’t reach API on phone with local URL | Use Mac LAN IP, not `localhost`; same Wi‑Fi; firewall allows port 3001 |

---

## Order of operations (minimal)

1. Fill **`server/.env`** (Access Key for Unsplash).  
2. **`cd server && npm start`**.  
3. Browser: **`localhost:3001/unsplash-ping`** → `ok: true`.  
4. Root **`.env`**: set **`EXPO_PUBLIC_API_URL`**.  
5. **`npx expo start -c`**.  
6. **Git push** → Railway **Root Directory `server`** → variables → deploy.  
7. Browser: **production `/` and `/unsplash-ping`**.  
8. Point app to Railway if using production.

---

More detail: **`DEPLOYMENT.md`**.
