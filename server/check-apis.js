#!/usr/bin/env node
/**
 * Standalone API status checker.
 * Run from project root: node server/check-apis.js
 * Then open http://localhost:3004
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });
config({ path: path.join(__dirname, ".env"), override: true });

const app = express();

app.get("/", (req, res) => {
  const openai = process.env.OPENAI_API_KEY;
  const google = process.env.GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  const ticketmaster = process.env.TICKETMASTER_API_KEY || process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;
  const showtimes = process.env.INTERNATIONAL_SHOWTIMES_API_KEY || process.env.EXPO_PUBLIC_INTERNATIONAL_SHOWTIMES_API_KEY;
  const unsplash = process.env.UNSPLASH_ACCESS_KEY || process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;

  const valid = (k) => k && k.trim() && !k.includes("your_key") && !k.includes("your_ticketmaster") && k !== "your_showtimes_key_here" && k !== "your_key_here";

  res.json({
    openai: valid(openai) ? "OK" : "add OPENAI_API_KEY to server/.env",
    google: valid(google) ? "OK" : "add GOOGLE_PLACES_API_KEY to server/.env",
    ticketmaster: valid(ticketmaster) ? "OK" : "add TICKETMASTER_API_KEY to server/.env",
    showtimes: valid(showtimes) ? "OK" : "optional",
    unsplash: valid(unsplash) ? "OK" : "optional",
  });
});

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`\nAPI status: http://localhost:${PORT}\n`);
});
