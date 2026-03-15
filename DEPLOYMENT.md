# Complete Deployment Guide

Use **Railway** for the server (simple, free tier, auto-deploys from GitHub).

---

## Part 1: Deploy the Server to Railway

### Step 1.1: Push your code to GitHub

If you haven't already:

```bash
cd /Users/drewauster/whats-the-move
git init
git add .
git commit -m "Initial commit"
```

Create a new repo at [github.com/new](https://github.com/new) named `whats-the-move`, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/whats-the-move.git
git branch -M main
git push -u origin main
```

### Step 1.2: Create a Railway account

1. Go to [railway.app](https://railway.app)
2. Click **Login** → **Login with GitHub**
3. Authorize Railway

### Step 1.3: Create a new project

1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Choose `whats-the-move` (or your repo name)
4. If prompted, click **Configure GitHub App** and allow Railway access to the repo

### Step 1.4: Configure the service to use the server folder

1. Click on the service that was created
2. Go to **Settings** (gear icon)
3. Scroll to **Source** or **Build**
4. Find **Root Directory** and set it to `server`
5. Leave **Start Command** blank (Railway uses `npm start` from package.json)
6. Railway will auto-redeploy

### Step 1.5: Add environment variables

1. In your Railway service, go to **Variables**
2. Click **Add Variable** or **Raw Editor**
3. Add each variable (get values from your local `server/.env`):

| Variable | Where to get it |
|----------|-----------------|
| `OPENAI_API_KEY` | [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys) |
| `GOOGLE_PLACES_API_KEY` | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) |
| `TICKETMASTER_API_KEY` | [developer.ticketmaster.com](https://developer.ticketmaster.com) (optional) |
| `EXPO_PUBLIC_TICKETMASTER_API_KEY` | Same as above (optional) |
| `EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY` | [internationalshowtimes.com](https://www.internationalshowtimes.com) (optional) |
| `UNSPLASH_ACCESS_KEY` | [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications) (optional) |

**Minimum required:** `OPENAI_API_KEY` and `GOOGLE_PLACES_API_KEY`

4. Click **Deploy** if it doesn’t auto-redeploy

### Step 1.6: Get your server URL

1. Go to **Settings** → **Networking** (or **Deployments**)
2. Click **Generate Domain**
3. Copy the URL (e.g. `https://whats-the-move-production.up.railway.app`)

### Step 1.7: Verify the server

Open in your browser:

- `https://YOUR-RAILWAY-URL/api-status`

You should see JSON with API status. If you see `"openai": "OK"` and `"google": "OK"`, the server is working.

---

## Part 2: Point the App at Your Server

### Step 2.1: Update .env in the project root

1. Open `/Users/drewauster/whats-the-move/.env` (create it if it doesn’t exist)
2. Add or update:

```
EXPO_PUBLIC_API_URL=https://YOUR-RAILWAY-URL
```

Replace `YOUR-RAILWAY-URL` with the URL from Step 1.6 (no trailing slash).

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
