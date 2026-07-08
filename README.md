# Movie Night — setup guide

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

7. Back in `src/firebase.js`, change `ROOM_ID` to something unique and hard to
   guess (like a random word plus numbers) — this is effectively your shared
   "room code" so only you two land on the same list.

8. Commit and push the updated `src/firebase.js`:

```
git add src/firebase.js
git commit -m "Add Firebase config"
git push
```

GitHub Actions will rebuild and redeploy automatically.

## 5. Set your TMDB key

Once the site is live, open it, go to **Setup**, and paste in your free TMDB
API key (see themoviedb.org → Settings → API) just like before — it's now
stored in Firestore so both of you see it after either one sets it.

## 6. Add it to your phone

Open the GitHub Pages URL on your phone, then:
- **iPhone (Safari)**: tap the Share icon → "Add to Home Screen"
- **Android (Chrome)**: tap the ⋮ menu → "Install app"

## Notes

- If your repo name isn't `movie-night`, edit the `base` value in
  `vite.config.js` to match before pushing (e.g. `/your-repo-name/`).
- The site is public, but the Firestore data is only reachable if someone
  knows your `ROOM_ID`, and the site itself has no listing anywhere — it's
  effectively private by obscurity, not bank-vault security. Don't put
  anything sensitive in it.
- Both of you now get live sync: if one person adds a movie, the other sees
  it appear in real time without refreshing.
