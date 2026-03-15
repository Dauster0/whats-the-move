# TestFlight Beta Guide

Use this checklist to ship a TestFlight beta and gather feedback before App Store release.

## Prerequisites

- [ ] Apple Developer account ($99/year)
- [ ] Server deployed and reachable (e.g. Railway, Render, Fly.io)
- [ ] All API keys configured in production env

## 1. Configure for Production

### App (Expo)

1. Set `EXPO_PUBLIC_API_URL` in `.env` to your production server URL (e.g. `https://your-app.fly.dev`)
2. In `app.json` or `app.config.js`, ensure:
   - `expo.name` and `expo.slug` are set
   - `expo.ios.bundleIdentifier` is set (e.g. `com.yourname.whatsthemove`)
   - `expo.version` and `expo.ios.buildNumber` are set

### Server

1. Deploy server with production env vars
2. Ensure CORS allows your app's origin
3. Run `npm run check-apis` against production URL

## 2. Build for TestFlight

```bash
# Install EAS CLI if needed
npm install -g eas-cli

# Login to Expo
eas login

# Configure the project (first time only)
eas build:configure

# Build for iOS (simulator build for local testing first)
eas build --platform ios --profile preview

# Build for TestFlight
eas build --platform ios --profile production
```

When prompted, link to your Apple Developer account. EAS will handle provisioning and signing.

## 3. Submit to TestFlight

```bash
# After build completes, submit to TestFlight
eas submit --platform ios --latest
```

Or in [Expo dashboard](https://expo.dev): Builds → Select build → Submit to App Store Connect.

## 4. Add Testers

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Your App → TestFlight
3. Add **Internal testers** (up to 100, same team)
4. Or create an **External group** and add testers by email (requires Beta App Review)

## 5. What to Ask Testers

- **Location**: Where are you testing? (city/area)
- **Quality**: Were the suggestions relevant and real places?
- **Errors**: Did you see any error messages or empty screens?
- **Flow**: Was it clear what to do? Any confusion?
- **Bugs**: Anything broken or unexpected?

## 6. Monitor

- Check server logs for errors
- Review analytics/error logs (see `lib/analytics.ts`)
- Fix critical issues before next build

## Quick Commands

```bash
# Full production build + submit
eas build --platform ios --profile production --non-interactive
eas submit --platform ios --latest --non-interactive
```
