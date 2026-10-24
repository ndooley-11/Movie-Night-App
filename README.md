# Movie Night — setup guide

## Local feature preview and checks

Run `npm install`, `npm test`, and `npm run build`. For an interactive local
preview, run `npm run dev` and open
`http://localhost:5173/Movie-Night-App/design/feature-preview.html`.
This development-only page uses sample data in local storage, never Firebase.
It supports switching between the two sample viewers and simulating a save
failure. The normal production entry point does not include this fixture.

Normal tests skip the optional live Firebase check. In PowerShell, run
`$env:MOVIENIGHT_LIVE_TEST="1"; node --test tests/room-sync.test.js` to test
simultaneous writes from two clients and live snapshots. It creates a unique
disposable room and deletes that room afterwards.

The Pick tab now previews eligible titles in a poster fan, with filters in a
collapsed accessible sheet and a brief, reduced-motion-aware winner reveal.
Choose for tonight saves a shared choice without changing watched history.
After watching, mark the movie watched together or start episode tracking.

Discover now uses a shuffled 20-card quota bag: 5 genuinely trending titles,
6 established favourites, 4 under-the-radar picks, 3 obscure wild cards, and
2 recent releases. Quotas persist across queue refills. Normally no more than
7 cards per bag are from the last three calendar years. Wild cards explore
random date windows and pages rather than reusing a popularity-only list.
Movies and TV have separate vote thresholds; language, genre, passed-title
and saved-title filters remain in effect. Narrow or exhausted pools may use
older fallback categories, recorded in the mixer's bag statistics. An outage
backs off and retries the same page; it is not treated as exhausted stock.

Watched includes optional personal reviews (up to 5,000 characters), spoiler
hiding, and separate Watching / Finished views with compact cards. Start a show from Watching's list
or from a Pick result. Progress means the **latest completed episode**. Each
viewer edits their own position; regular episodes are counted across seasons.
Specials are separate. Unknown/incomplete metadata never produces a guessed
gap, and known unreleased episodes cannot be selected. Complete a show
separately for each viewer; it enters completed history once both finish.
Use “Resume watching together” in a finished card's menu when a new season arrives.
Progress changes and deleted reviews offer Undo, guarded against overwriting a newer edit.

New `reviews.p0/p1` and `showProgress.p0/p1` fields use stable player slots,
so changing names does not orphan this new data. Renaming also atomically migrates
existing ratings, seen status, likes, hype, and streaming preferences. Existing titles, ratings,
history and room fields remain compatible. Updates to the movie array now
use Firestore transactions to preserve concurrent changes by both devices.
Do not run older app versions concurrently when testing these changes:
older clients still replace the entire array and can overwrite newer fields.

**Identity limitation:** this app has no authenticated user accounts. The
selected player determines which review/progress controls can be edited,
but a room participant can switch identities. This is not server-enforced
ownership or strong room privacy. The sample Firestore rules below permit
unauthenticated reads and writes to the collection, including listing rooms;
knowing a room code is not an access-control boundary. Reviews are not
published in a public feed, but do not treat the storage as secure private
notes. No authentication or deployed Firestore rules were changed by these
features. Server-enforced ownership would require a separate sign-in and
rules change.

This turns the app into a real website at `https://yourname.github.io/movie-night/`
that works for both of you with no Claude account needed. Total time: ~15 minutes.

## 1. Create the GitHub repo

1. Go to github.com and sign in (or create a free account).
2. Click the **+** in the top right → **New repository**.
3. Name it `movie-night` (or anything — just remember it, you'll need it in step 4).
4. Set it to **Public**, don't add a README, click **Create repository**.

## 2. Get the code onto your computer and push it

Open a terminal in this folder (the one this README is in) and run:

```
git init
git add .
git commit -m "Movie night app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/movie-night.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## 3. Turn on GitHub Pages

1. On your repo's GitHub page, click **Settings** → **Pages** (left sidebar).
2. Under "Build and deployment", set **Source** to **GitHub Actions**.
3. That's it — the workflow in `.github/workflows/deploy.yml` will build and
   deploy automatically every time you push to `main`. Check the **Actions**
   tab to watch it run (~1-2 minutes).

## 4. Create your free Firebase project (this replaces Claude's storage)

1. Go to https://console.firebase.google.com and sign in with any Google account.
2. Click **Add project**, name it anything (e.g. "movie-night"), you can skip
   Google Analytics.
3. Once created, click the **`</>`** (web) icon on the project overview page
   to register a web app. Give it any nickname, skip Firebase Hosting.
4. It will show you a `firebaseConfig` object. Copy those values into
   `src/firebase.js` in this project, replacing the placeholder text.
5. In the left sidebar, go to **Build → Firestore Database** → **Create database**.
   Choose any region close to you, and start in **test mode** for now (we'll lock
   it down in the next step).
6. Go to the **Rules** tab in Firestore and replace the rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /movienight/{document=**} {
      allow read, write: if true;
    }
  }
}
```

   Click **Publish**. This keeps the database open only under the `movienight`
   collection — anyone who doesn't know your specific room ID can't find your data.

7. Commit and push the updated `src/firebase.js`:

```
git add src/firebase.js
git commit -m "Add Firebase config"
git push
```

GitHub Actions will rebuild and redeploy automatically.

The site now supports any number of couples sharing the same deployment —
there's no more hardcoded room ID to edit. The first time you open the app,
choose **Start a room** to get a short, shareable code (like `amber-otter-42`),
or **Join a room** if your partner already made one. Only people who know the
code can see that room's list — same obscurity-based privacy as before, just
chosen in the app instead of hardcoded at deploy time.

## 5. Set your TMDB key

Once the site is live, open it, go to **Setup**, and paste in your free TMDB
API key (see themoviedb.org → Settings → API) just like before — it's now
stored in Firestore so both of you see it after either one sets it.

## 6. Add it to your phone

The room-code page offers an iPhone Safari welcome sheet with an embedded,
looping installation animation. It begins with an immediate tap cue, gives each
action 1.2 seconds, and holds the final screen for 1.5 seconds before repeating.
Continue, Escape, or tapping outside dismisses
it; that choice is remembered on the device. The small “Add to Home Screen” link
replays it. It stays hidden in installed Home Screen mode and in other browsers.
Reduced-motion users get manual frame controls instead of autoplay.

Open the GitHub Pages URL on your phone, then:

- **iPhone (Safari)**: page menu beside the address → Share → View More (if shown)
  → Add to Home Screen → leave Open as Web App on → Add. Safari's other toolbar
  layouts may show Share directly.
- **Android (Chrome)**: tap the ⋮ menu → "Install app"

Local component check: `/Movie-Night-App/design/install-preview.html`; append
`?reduced=1` to emulate reduced motion in this development-only fixture.

## Notes

- If your repo name isn't `movie-night`, edit the `base` value in
  `vite.config.js` to match before pushing (e.g. `/your-repo-name/`).
- The site is public, but the Firestore data is only reachable if someone
  knows your room code, and the site itself has no listing anywhere — it's
  effectively private by obscurity, not bank-vault security. Don't put
  anything sensitive in it.
- Add a free [Trakt.tv](https://trakt.tv/oauth/applications) Client ID in
  Settings (optional) to blend Trakt's trending data into Discover's
  "trending" quarter, alongside TMDB's own trending feed.
- Both of you now get live sync: if one person adds a movie, the other sees
  it appear in real time without refreshing.
