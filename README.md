# Ultimate File Sharing

Admin-controlled file sharing site. Everyone can download. Only the admin
(unlocked via the small "Welcome Priyatham" text in the bottom-right corner)
can upload or delete files.

## Why the old "File missing from storage" error happened

Render's free/standard web services use an **ephemeral filesystem** — any
file you save to a local `/uploads` folder is wiped every time the app
redeploys, restarts, or scales. That's exactly what was causing the error.

This version fixes it permanently by **never writing files to local disk**.
Uploaded files are streamed straight into **MongoDB GridFS** (the same
MongoDB database you're already using for metadata), so they persist across
restarts and redeploys with no extra paid disk or third-party storage
account required.

## Features

- Public: browse and download files, no login needed.
- Admin only (single password, bcrypt-hashed, checked server-side): upload
  (drag-and-drop or click-to-browse, multi-file, progress bars), delete
  (with confirmation).
- Session-based auth (`express-session` + MongoDB session store) — the
  frontend never sees or stores the real password.
- CSRF token required on every upload/delete request.
- Security: helmet, CORS allow-list, rate limiting on login and uploads,
  file size caps, sanitized filenames.
- Dark glassmorphism UI, fully responsive.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

1. `MONGO_URI` — a MongoDB Atlas connection string (free tier is fine).
2. `SESSION_SECRET` — any long random string, e.g. `openssl rand -hex 32`.
3. `ADMIN_PASSWORD_HASH` — generate it:
   ```bash
   node scripts/hash-password.js YourRealPassword
   ```
   Copy the printed hash into `.env`. The plain password is never stored
   anywhere.
4. `ALLOWED_ORIGINS` — leave blank unless you're calling the API from a
   different domain than the one serving the site.

Run locally:

```bash
npm start
```

Visit `http://localhost:5000`. Click **Welcome Priyatham** bottom-right to
log in as admin.

## Deploying to Render

1. Push this project to your GitHub repo.
2. In Render, set the environment variables above (Environment tab) —
   don't commit `.env`.
3. Build command: `npm install`. Start command: `npm start`.
4. No persistent disk is required — GridFS storage lives inside your
   MongoDB Atlas cluster, not on Render's filesystem.

## Project structure

```
server.js               Express app entry point
routes/authRoutes.js     Login / logout / session status
routes/fileRoutes.js     List / upload / download / delete (GridFS)
models/FileMeta.js       Mongoose schema for file metadata
middleware/auth.js       requireAdmin + CSRF guards
scripts/hash-password.js One-off helper to bcrypt-hash your admin password
public/                  Frontend (index.html, style.css, script.js)
```

## Notes on the "Welcome Priyatham" text

It's a real `<button>` element, just styled small and low-contrast in the
corner — not `display:none` or `visibility:hidden`. That keeps it genuinely
clickable and accessible while staying visually out of the way.
