# APIs You Need

| API | Required? | Get Key | Add to |
|-----|------------|---------|--------|
| **OpenAI** | Yes | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `server/.env` as `OPENAI_API_KEY` |
| **Google Places** | Yes | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials | `server/.env` as `GOOGLE_PLACES_API_KEY` |
| **Ticketmaster** | Optional (comedy/theater events) | [developer.ticketmaster.com](https://developer.ticketmaster.com) | `server/.env` as `TICKETMASTER_API_KEY` |
| **International Showtimes** | Optional (movie times) | [internationalshowtimes.com](https://www.internationalshowtimes.com) | `server/.env` as `INTERNATIONAL_SHOWTIMES_API_KEY` |
| **Unsplash** | Optional (nicer photos) | [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications) | `server/.env` as `UNSPLASH_ACCESS_KEY` |

## Google Cloud – enable these APIs

In [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Library → search and enable:

- **Places API (New)** – search, photos
- **Places API** – legacy fallback
- **Distance Matrix API** – drive times
- **Directions API** – drive time fallback

## Check if they work

**Option A – standalone checker (recommended):**
```bash
npm run check-apis
```
Then open **http://localhost:3004** in your browser.

**Option B – main server:** Run `node server/index.js`, then open **http://localhost:3001/**
