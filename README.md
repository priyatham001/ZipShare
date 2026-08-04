# ZipShare V3

A student-friendly file & folder sharing platform. Node.js + Express + MongoDB backend, vanilla HTML/CSS/JS frontend.

## What's new in this build

- **Folder uploads** — no more zipping. Click "Upload Folder" and pick a folder directly (`webkitdirectory`); the folder structure is preserved as metadata and files are grouped back into one card, downloadable as a zip.
- **Anonymous / Admin badge** — bottom-right corner shows "Welcome Anonymous" until an admin logs in, then "Welcome Admin". Your name is never shown.
- **Protected admin login** — wrong password shows "Access Denied. Incorrect password." After 3 failed attempts, login locks for 30 seconds with a warning that the platform is Admin-protected, shown with a 😂 toast.
- **Admin-only management** — delete, rename, pin, edit description/tags are all gated behind `requireAdmin` on the backend (not just hidden in the UI), so it can't be bypassed by calling the API directly.
- **Live search + admin-curated suggestions** — trending searches are fully editable by the admin (`/api/admin/suggestions`); "Recently Uploaded" auto-populates from the newest Java/Python/C/C++ files.
- **Theme intro** — first visit asks Light or Dark, saves to localStorage, then shows an animated "Welcome to ZipShare" splash before the app.
- **Animated glass UI** — floating gradient blobs, mouse glow, card hover/tilt, toasts, stats bar, filter chips, in-browser preview (text/code/image/PDF).

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set MONGODB_URI, ADMIN_PASSWORD, JWT_SECRET
npm start
```

Visit `http://localhost:5000`.

## Deploying to Render

1. Push this folder to a GitHub repo.
2. New Web Service on Render → connect the repo.
3. Build command: `npm install`  ·  Start command: `npm start`.
4. Add environment variables in the Render dashboard: `MONGODB_URI`, `ADMIN_PASSWORD`, `JWT_SECRET`.
5. Deploy. Uploaded files live in `/uploads` on the server's disk — note that Render's free tier disk is **ephemeral**, so files are lost on redeploy/restart unless you attach a persistent disk or move to S3-style storage later.

## Project structure

```
zipshare/
├── server.js
├── package.json
├── .env.example
├── middleware/auth.js       # admin token + lockout logic
├── models/File.js
├── models/Suggestion.js
├── routes/files.js          # upload, list, search, download, preview, admin edits
├── routes/admin.js          # login + suggestion CRUD
└── public/
    ├── index.html
    ├── style.css
    └── script.js
```

## Notes / assumptions

- Files are stored flatly on disk with random names; the original folder path is kept in MongoDB (`relativePath`) purely as metadata, and a folder is re-zipped on demand when downloaded. This avoids any path-traversal risk from user-supplied folder names.
- Admin sessions use a signed JWT stored in `localStorage`, valid for 4 hours, sent as `Authorization: Bearer <token>`.
- All admin-only routes double-check the token server-side — the UI hiding buttons is just for polish, not the actual security boundary.
- This was rebuilt from your spec document rather than your live repo (I didn't have your actual server.js/public files, only screenshots and the prompt), so filenames/structure may differ from what was previously deployed. Swap in your real `MONGODB_URI` and it should run as-is.
