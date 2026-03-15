# What to Do Next

## 1. Run the app (2 terminals)

**Terminal 1 – server:**
```bash
cd whats-the-move && node server/index.js
```

**Terminal 2 – Expo:**
```bash
cd whats-the-move && npx expo start -c
```

On a physical device, scan the QR code. Ensure the device and computer are on the same Wi‑Fi.

---

## 2. Check APIs

Open **http://localhost:3001/api-status** (or `http://YOUR_IP:3001/api-status`) with the server running.

You want `openai` and `google` to show `"OK"`. Ticketmaster should show `"OK"` if you added the key.

---

## 3. Fix server URL on device

If the app can’t reach the server, set `EXPO_PUBLIC_API_URL` in `.env` to your computer’s IP:

```bash
# Mac: get your IP
ipconfig getifaddr en0
```

Then in `.env`:
```
EXPO_PUBLIC_API_URL=http://YOUR_IP:3001
```

Restart Expo with `npx expo start -c`.

---

## 4. Optional: International Showtimes (movie times)

Sign up at [internationalshowtimes.com](https://www.internationalshowtimes.com) and add to `server/.env`:

```
INTERNATIONAL_SHOWTIMES_API_KEY=your_key
```

---

## 5. Optional: Unsplash (better photos)

Get a key at [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications) and add to `server/.env`:

```
UNSPLASH_ACCESS_KEY=your_key
```

---

## 6. Deploy (when ready)

- **Expo:** Use EAS Build for iOS/Android.
- **Server:** Deploy to Railway, Render, Fly.io, or similar.
- Update `EXPO_PUBLIC_API_URL` to your production server URL.
