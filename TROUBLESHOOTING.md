# Seeing Old Suggestions After Changes?

**Restart both:**
1. **Server** – Stop (Ctrl+C) and run `node server/index.js` again
2. **Expo** – Run `npx expo start -c` (the `-c` clears cache)

The app gets suggestions from the client (Overpass, Google Places) and the server (AI expansion). Both need to reload to pick up changes.

---

# Why You Were Getting the Same 3 Moves (and How to Fix It)

## What Was Going Wrong

The app has a long chain of steps, and **any single failure** caused it to fall back to the same 3 hardcoded moves (Comedy Store, Level8, Griffith Observatory):

1. **Client** gets your location (lat, lon)
2. **Client** calls `getAIGrounding()` which tries Overpass, Google Places, Ticketmaster
3. **Client** sends candidates + lat/lon to the **server**
4. **Server** fetches Overpass (when it has lat/lon)
5. **Server** filters candidates
6. **Server** calls OpenAI to pick 3
7. **Server** returns moves

**Failure points that all led to the same fallback:**
- Client Overpass could fail (CORS, React Native limits)
- Client might not send lat/lon (permission, timing)
- Server might not receive the request (wrong IP, wrong port)
- Server Overpass could fail (timeout, network)
- `hardFilterCandidates` could filter out all results
- OpenAI could fail (key, rate limit)

## The Fix

**When the server has your coordinates, it now returns Overpass results directly** — no AI, no client candidates, no fallback. Just real nearby places.

## If You Still Get the Same 3 Moves

1. **Check the server terminal** when you tap Generate. You should see:
   ```
   REQUEST RECEIVED - lat: 34.05 lng: -118.25 place: Los Angeles
   Fetching Overpass for 34.05 -118.25
   Overpass raw count: 12
   After filter: 8 [...]
   Returning direct Overpass moves: 3
   ```

2. **If you see `lat: null lng: null`** — the app never sent your location. Check:
   - Location permission is enabled for the app
   - You're not in a simulator with location disabled

3. **If the request never reaches the server** — the app might be using the wrong URL:
   - On a physical device, the app must call your computer’s IP (e.g. `http://192.168.1.154:3001`)
   - On the same machine, use `http://localhost:3001`
   - Your computer’s IP can change (e.g. after restart). Update the URL in `app/whats-the-move-ai.tsx` line 58.

4. **Test the server directly:**
   ```bash
   curl -X POST http://localhost:3001/debug-location \
     -H "Content-Type: application/json" \
     -d '{"lat":34.05,"lon":-118.25,"place":"LA"}'
   ```
   You should see `hasLat: true, hasLon: true`.

## Getting Specific Movie/Theater Show Names

The app tries to show specific titles (e.g. "Go to Norris Cinema for Dune at 7:30 PM") instead of generic "see what's on." This uses two APIs:

1. **Ticketmaster** – for live theater, comedy, concerts. Add `EXPO_PUBLIC_TICKETMASTER_API_KEY` to `.env` (get one at developer.ticketmaster.com).

2. **International Showtimes** – for movie showtimes at cinemas. Add `EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY` to `.env`. Sign up at [internationalshowtimes.com](https://www.internationalshowtimes.com/) (free trial available).

Campus or indie cinemas (e.g. USC Norris) may not be in these databases. If you still see "see what's on tonight," the venue likely isn't covered by either API.

## Place Photos

Photos appear on suggestion cards and the detail screen. The app tries **Places API (New)** first, then falls back to the legacy **Places API** if needed.

**To get real photos:** Add a valid key to `server/.env`:
- `GOOGLE_PLACES_API_KEY=your_actual_key`

**For more compelling photos:** Add `UNSPLASH_ACCESS_KEY` to `server/.env` (get a free key at [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications)). The app will try Unsplash first for atmospheric, high-quality photos, then fall back to Google.

**If photos still don't show:**
1. **Test the API** – In your browser, open: `http://localhost:3001/photo-test`  
   If you see `{"ok":true,"photoUrl":"https://..."}`, the API works. If you see an error, fix the key or billing.
2. **Check server logs** – When you tap Generate moves, you should see `Place photo request: The Smell Los Angeles` and either `Place photo OK` or `Place photo: no result`. If you see nothing, the app isn't reaching the server.
3. **Fix the server URL** – On a physical device, the app must use your computer's IP. Find it: run `ipconfig getifaddr en0` (Mac) or `hostname -I` (Linux). Add to `.env`: `EXPO_PUBLIC_API_URL=http://YOUR_IP:3001`. Restart Expo with `npx expo start -c`.

## Drive Time Estimates

Instead of "X mi away," the app uses Google Maps to show real drive times (e.g. "15 mins drive"). It tries **Distance Matrix API** first, then **Directions API** as fallback.

**Enable at least one:** In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Enable **Distance Matrix API** and/or **Directions API** for your project. Uses the same `GOOGLE_PLACES_API_KEY` as photos.
