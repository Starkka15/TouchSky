# TouchSky

A full **Bluesky** client for the **HP TouchPad** (webOS), written as an Enyo 1.0
web app. It signs in with an app password and runs entirely on-device, talking
straight to the AT Protocol over HTTPS.

## Features

- **Home timeline** with avatars, images, quoted posts, link cards, and emoji
  (rendered as images, since the tablet's font has no color emoji).
- **Post, reply, like, repost** — and **long-press a picture to save it** to the
  tablet.
- **Threads** — tap a post to see it in context, with ancestors and nested replies.
- **Profiles** — your own and anyone else's (tap a name); **follow / unfollow**.
- **Explore / Search** — posts and people.
- **Notifications**, **Feeds** (your saved/pinned feeds), **Lists**, and
  **Saved** posts (bookmarked on the tablet).
- **Direct messages** — conversations and replies.
- **Video playback** — Bluesky's HLS video plays in a fullscreen player, bridged
  through an on-device relay (the tablet's media stack can't reach modern HTTPS on
  its own).
- **Links** open where they belong — **YouTube** links hand off to the MeTube app;
  everything else opens in the browser (Atlas if it's installed).

A Bluesky-style left rail runs down the side: Home, Explore, Notifications, Chat,
Feeds, Lists, Saved, Profile, Settings, with New Post at the bottom.

## How it works on a 2011 tablet

- **Auth is an app password, not OAuth** — `createSession` returns a token pair;
  the access token is refreshed automatically.
- **Images:** `cdn.bsky.app` serves WebP (which this WebKit can't decode) and its
  image loader can't reach the host, but the app's `XMLHttpRequest` can — so images
  are fetched with an `@jpeg` suffix and handed to WebKit as `data:` URIs, cached.
- **Video:** a small Palm service (`service/hlsrelay.js`) fetches the HLS playlist
  and segments with the system `curl`, serves them back on `127.0.0.1` with the
  right content type, and the app plays that in a `<video>` element.
- **Direct messages** are served by `api.bsky.chat` directly.

## Parts

- `app/source/` — the app: `Api.js` (AT Protocol), `Util.js` (settings, session,
  images, emoji), and a kind per screen (`Feed`, `Post`, `Thread`, `Profile`,
  `Explore`, `Feeds`, `Lists`, `Chat`, `Notifications`, `Saved`, `Compose`,
  `Login`, `App`).
- `service/` — a Palm node service: `save.js` (save pictures) and `hlsrelay.js`
  (relay video).

## Building and installing

Needs the Palm SDK and a Java runtime (paths set at the top of `tools/deploy.ps1`).
With the TouchPad on USB:

```
tools\deploy.ps1
```

Or install the `.ipk` from the Releases page with Preware or `palm-install`.

## Not done yet

- In-text link facets aren't tappable yet (external link cards are).
- Ultra-short videos (under ~12s / fewer than 3 HLS segments) don't play — a quirk
  of the old GStreamer's HLS caching.
- Group DMs, read receipts, and reactions.

## Credits & license

Built for the webOS community on the HP TouchPad. Not affiliated with Bluesky.
