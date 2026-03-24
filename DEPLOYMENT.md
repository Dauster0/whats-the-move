# Complete Deployment Guide

**US-wide behavior:** Venue logic (categories, editorial Unsplash queries, Ticketmaster matching) is written for **any US city**—avoid hardcoding a single metro’s team names or landmarks in app code. If you need venue-specific Ticketmaster aliases, prefer env or a small deploy-side config rather than shipping city-only lists in the repo.

### Step 1.4: Configure the service to use the server folder

1. Click on the service that was created
2. Go to **Settings** (gear icon)
3. Scroll to **Source** or **Build**
4. Find **Root Directory** and set it to `server`
5. Leave **Start Command** blank (Railway uses `npm start` from package.json)
6. Railway will auto-redeploy

#### Redeployed but `/` still shows only `openai` / `google` / `unsplash` (no `ok` or `photoPipeline`)?

That response is **not** from the current `server/index.js` in this repo — Railway is still running an **older build** or the **wrong folder**.

Check these in order:

1. **Push your code to GitHub** (or whatever Railway watches). Edits only on your laptop do **nothing** until you `git add`, `git commit`, and `git push`. In Railway → **Deployments**, open the latest deploy and confirm the **commit SHA** matches your latest push.

2. **Root Directory must be `server`** (Settings → Build / Source). If it’s empty or set to the repo root, Railway may run the **Expo app’s** `npm start` (`expo start`) instead of the API, or pick up an old/wrong `package.json`.

3. **Correct service** — make sure the public URL is attached to the **Node API** service, not a database or a second placeholder service.

4. After a successful deploy, **`GET /`** must look like:
   ```json
   { "ok": true, "service": "whats-the-move", "photoPipeline": "unsplash-editorial-v1", "hint": "..." }
   ```
   **`GET /api-status`** must include **`photoPipeline`** and **`unsplashEnv`** (not just five string fields).

### Step 1.5: Add environment variables

1. In your Railway service, go to **Variables**
2. Click **Add Variable** or **Raw Editor**
3. Add each variable (get values from your local `server/.env`):

| Variable | Where to get it |
|----------|-----------------|
| `OPENAI_API_KEY` | [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys) |
| `GOOGLE_PLACES_API_KEY` | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) — enable **Places API (New)** for Text Search + Place Details, and **Places API** (legacy) for Text Search + Details **metadata** fallback (ratings, summary). Google is **not** used for list/detail photos. |
| `UNSPLASH_ACCESS_KEY` | [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications) — **required for photos** in the app (`/place-photo` list heroes and `/place-details` carousel). Uses curated editorial-style searches by category/vibe (not random venue-name Google image search). You can also set `EXPO_PUBLIC_UNSPLASH_ACCESS_KEY` to the same value. |
| `TICKETMASTER_API_KEY` | [developer.ticketmaster.com](https://developer.ticketmaster.com) (optional) |
| `EXPO_PUBLIC_TICKETMASTER_API_KEY` | Same as above (optional) |
| `EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY` | [internationalshowtimes.com](https://www.internationalshowtimes.com) (optional) |

**Minimum required:** `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and `UNSPLASH_ACCESS_KEY` (for imagery; without Unsplash, photo endpoints return empty URLs).

4. Click **Deploy** if it doesn’t auto-redeploy

#### Photos still look like old Google storefronts?

`unsplash: configured` only means the **key** is set — it does **not** prove Railway is running the **latest server code**. After each deploy, verify:

1. **`GET https://YOUR-RAILWAY-URL/`** must include `"ok": true`, `"service": "whats-the-move"`, and **`"photoPipeline": "unsplash-editorial-v1"`**.  
   If you see only `{ "openai": "OK", "google": "OK", ... }` with **no** `ok` / `service` / `photoPipeline`, the deployment is **still an old build** — push this repo’s `server/` to Railway and redeploy.

2. **`GET .../place-photo?q=museum&sourceName=Test&area=Los%20Angeles`** — `photoUrl` should point at **`images.unsplash.com`** (or similar Unsplash CDN), **not** `lh3.googleusercontent.com` or `maps.googleapis.com`.

3. **Root** `EXPO_PUBLIC_API_URL` in the app must point at the **same** Railway URL you checked above, then restart Expo with cache clear: `npx expo start -c`.

4. **Unsplash dashboard shows 0 requests** — the app uses the **Access Key** (`Authorization: Client-ID …`), **not** the Secret Key. After deploy, open **`GET /unsplash-ping`** on your server. You should see `"ok": true`, `"httpStatus": 200`, and **`"photoPipeline": "unsplash-editorial-v1"`**. If `httpStatus` is **401/403**, the key in Railway is wrong or the Secret was pasted by mistake. If `/unsplash-ping` **404s**, you’re still on old server code (redeploy from this repo with Root Directory `server`).

### Step 1.6: Get your server URL

1. Go to **Settings** → **Networking** (or **Deployments**)
2. Click **Generate Domain**
3. Copy the URL (e.g. `https://whats-the-move-production.up.railway.app`)

### Step 1.7: Verify the server

Open in your browser (use your real Railway URL):

1. **`https://YOUR-RAILWAY-URL/health`** — should return `{"ok":true}` immediately (confirms the app is reachable).
2. **`https://YOUR-RAILWAY-URL/`** — quick JSON saying the service is up (no slow checks).
3. **`https://YOUR-RAILWAY-URL/api-status`** — full key checks (OpenAI/Google, etc.). If you see `"openai": "OK"` and `"google": "OK"`, keys are valid. For Unsplash, check **`unsplashEnv`**: if **`UNSPLASH_ACCESS_KEY_chars`** and **`EXPO_PUBLIC_UNSPLASH_ACCESS_KEY_chars`** are both **0**, the key is not in Railway’s environment (your laptop’s `server/.env` is **not** used in production — add the same variable in **Railway → Variables** and redeploy).

If the bare domain ever showed **“Application failed to respond”**, it was often because the old root URL waited on slow external API calls and timed out. Redeploy after pulling the latest server code so `/` stays fast.

#### If deploy logs look fine but the browser still says “Application failed to respond”

That usually means **the public URL is not attached to the service that is running Node**, or the edge timed out on a cold start.

1. **Same service:** Open **Settings → Networking** on the **whats-the-move** service (the one whose **Deploy Logs** show `AI move server listening`). Your generated domain must appear **on that service**. If you have more than one service (e.g. database + web), the domain might be on the wrong one — **remove** the domain from the wrong service and **Generate Domain** on the API service, or use **Custom Domain** mapping in Railway’s UI.
2. **HTTP Logs:** In Railway, open **HTTP Logs** for this service and load `/health` in the browser. If you see **no request**, traffic isn’t reaching this service (wrong domain/service). If you see **502/503**, check deploy logs for crashes right after startup.
3. **Retry:** After a deploy or scale-from-zero, wait **30–60 seconds** and try `/health` again once or twice.

---

## Part 2: Point the App at Your Server

### Step 2.1: Update .env in the project root

1. Open `/Users/drewauster/whats-the-move/.env` (create it if it doesn’t exist)
2. Add or update:

```
EXPO_PUBLIC_API_URL=https://YOUR-RAILWAY-URL
```

Replace `YOUR-RAILWAY-URL` with the URL from Step 1.6 (no trailing slash).

**Physical phone on the same Wi‑Fi (local server):** `localhost` only works on the simulator. Set `EXPO_PUBLIC_API_URL` to your Mac’s LAN URL, e.g. `http://192.168.1.x:3001` (same port as `node server/index.js`). If photos and `/place-details` work in `curl` on the Mac but not in the app on a device, this is almost always the cause.

3. Save the file

### Step 2.2: Restart Expo

```bash
cd /Users/drewauster/whats-the-move
npx expo start -c
```

The `-c` clears the cache so it picks up the new env var.

---

## Part 3: Build for TestFlight

### Step 3.1: Install EAS CLI and log in

```bash
npm install -g eas-cli
eas login
```

Use your Expo account email and password.

### Step 3.2: Configure EAS (first time only)

```bash
cd /Users/drewauster/whats-the-move
eas build:configure
```

Press Enter to accept defaults.

### Step 3.3: Build for iOS

```bash
eas build --platform ios --profile production
```

- When asked **Would you like to log in to your Apple account?** → Yes
- Sign in with your Apple ID (the one tied to your Developer account)
- Wait 15–25 minutes for the build

### Step 3.4: Submit to TestFlight

When the build finishes:

```bash
eas submit --platform ios --latest
```

- Choose the build that just completed
- When asked for Apple ID, use the same Apple ID
- Select your team and app (or create a new app in App Store Connect if needed)

### Step 3.5: Add testers

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Open **My Apps** → your app (or the one that was created)
3. Click **TestFlight**
4. Under **Internal Testing**, click **+** to add testers (up to 100)
5. Or create an **External Group** and add emails (requires Beta App Review)

---

## Part 4: Test and Monitor

1. Install the app from the TestFlight link
2. Use it in different locations
3. Check Railway logs: Railway dashboard → your service → **Deployments** → **View Logs**
4. Look for `[ERROR]` and `[EVENT]` lines from the `/log` endpoint

---

## Quick Reference

| Step | Command / Action |
|------|------------------|
| Deploy server | Push to GitHub → Railway auto-deploys |
| Get server URL | Railway → Settings → Generate Domain |
| Update app URL | Set `EXPO_PUBLIC_API_URL` in `.env` |
| Build iOS | `eas build --platform ios --profile production` |
| Submit | `eas submit --platform ios --latest` |
