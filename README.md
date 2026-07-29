# ZipShare v3.1

**A Student-Friendly File Sharing Platform**
Easily view or download programs, notes, assignments, and lab resources shared by your friends.
Only administrators can upload, edit, pin, rename, or delete files and folders.

🚀 Developed by **NOMAD TEAM**

---

## What's inside

- **Node.js + Express** backend, **MongoDB** (via Mongoose) for metadata, files stored on disk under `uploads/`
- Vanilla HTML/CSS/JS frontend — glassmorphism UI, animated gradient background, light/dark theme with a welcome screen
- **Folder uploads** with structure preserved (`webkitdirectory`), folder download as a generated ZIP
- **Strict admin-only permissions**: uploading, renaming, deleting, pinning, and editing details all require an authenticated admin session (JWT in an httpOnly cookie). Everyone else gets read-only browse/search/preview/download.
- Admin login with a 3-attempt lockout (30 seconds) and a generic "Access Denied" message — no internal details are ever exposed to the client
- In-browser preview for images, PDFs, and code/text files
- Search with debouncing, admin-managed trending/recent suggestions, and tag-aware matching
- Admin dashboard: file/folder counts, downloads, today's uploads, storage used, and suggestion management
- 🚀 "Project Developed by NOMAD TEAM" floating badge with hover tooltip and modal on every page

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your own values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on (default `5000`) |
| `MONGO_URI` | Your MongoDB connection string (local or Atlas) |
| `ADMIN_PASSWORD` | The password used to log in as admin — **change this from the default** |
| `JWT_SECRET` | A long random string used to sign admin session tokens |
| `CORS_ORIGIN` | Leave blank for same-origin deployment, or set your frontend origin |
| `NODE_ENV` | `development` or `production` |

⚠️ Never commit your real `.env` file — it's already excluded via `.gitignore`.

## 3. Run locally

```bash
npm run dev     # with nodemon, auto-restarts on changes
# or
npm start
```

Visit `http://localhost:5000`.

## 4. Deploying to Render

1. Push this project to a GitHub repository.
2. Create a new **Web Service** on Render, pointing at the repo.
3. Build command: `npm install` — Start command: `npm start`
4. Add the environment variables from the table above in Render's dashboard (use a MongoDB Atlas connection string for `MONGO_URI` — Render's filesystem is ephemeral on redeploys, so for persistent file storage in production consider attaching a Render Disk to the `uploads/` folder, or migrating file storage to an object store like S3/Cloudinary later).
5. Deploy. Share the link with friends, e.g.:

   > 🎉 ZipShare is Live! Type `zipshare.onrender.com` in your browser to access Java, Python, C, Data Structures programs, notes, and assignments shared by friends. 🚀 A Student-Friendly File Sharing Platform — Developed by NOMAD TEAM.

## Project structure

```
zipshare/
├── server.js               # Express app entry point
├── middleware/auth.js       # JWT admin auth + login lockout logic
├── models/
│   ├── FileItem.js          # File/folder metadata schema
│   └── Suggestion.js        # Search suggestion schema
├── routes/
│   ├── auth.js               # /api/auth  — login, logout, status
│   ├── upload.js              # /api/upload — admin-only file/folder upload
│   ├── files.js                # /api/files — list, search, download, delete, rename, pin, tag
│   └── suggestions.js          # /api/suggestions — admin-managed search suggestions
├── utils/
│   ├── fsSafety.js           # Filename sanitization + path traversal protection
│   └── fileTypes.js          # Extension → icon/color mapping (server-side reference)
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── uploads/                 # File storage root (gitignored, kept via .gitkeep)
```

## Admin-only permissions (enforced server-side)

Every mutating route checks the admin session on the **server**, not just the UI — hiding buttons in the browser is only a convenience; the API itself rejects unauthenticated requests with `401`:

- `POST /api/upload` — upload files/folders
- `PATCH /api/files/:path/rename` — rename a file or folder
- `PATCH /api/files/:path/pin` — pin/unpin
- `PATCH /api/files/:path/details` — edit description/tags
- `DELETE /api/files/:path` — delete a file or an entire folder (recursively)
- `POST/PATCH/DELETE /api/suggestions` — manage search suggestions
- `GET /api/files/stats` — dashboard statistics

Read-only routes (`GET /api/files`, `GET /api/files/download/*`, `GET /api/files/download-folder/*`) are open to everyone so friends can browse and download without logging in.

## Security notes

- Filenames and folder paths are sanitized and checked against path traversal on every upload, rename, and delete.
- Admin sessions use an httpOnly, signed JWT cookie — never exposed to client-side JavaScript.
- Failed admin logins are rate-limited: after 3 consecutive failures, login is locked for 30 seconds, with only a generic message shown to the user.
- A global API rate limiter is applied to reduce abuse.
- `helmet` sets standard security headers.

## Notes on this build

This is a fresh implementation built from your spec (no existing codebase was uploaded alongside the prompt), so review it against your current Render deployment before switching over — in particular, if your existing app has additional API routes or a different MongoDB schema, port that data over or adjust the models in `models/` to match.
