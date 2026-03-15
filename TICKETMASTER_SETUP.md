# Ticketmaster API – Step by Step

1. Go to **[developer-acct.ticketmaster.com/user/register](https://developer-acct.ticketmaster.com/user/register)**

2. Fill out the form:
   - First name, last name
   - Company name (can use your name or app name)
   - Company site URL (can use a placeholder like `https://example.com`)
   - Username
   - Email
   - Country
   - Accept the terms

3. Confirm your email (check inbox for the link).

4. Log in at **[developer.ticketmaster.com](https://developer.ticketmaster.com)**

5. Open **My Apps** (or **Apps** in the top nav).

6. Click **Create App** (or **Add App**).

7. Enter an app name (e.g. "What's the Move") and save.

8. Open the app and copy the **Consumer Key** (this is your API key).

9. Add to `server/.env`:
   ```
   TICKETMASTER_API_KEY=your_consumer_key_here
   ```

10. Restart the server.
