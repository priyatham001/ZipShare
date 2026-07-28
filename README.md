# ZipShare

Upload, share, and manage ZIP files. Anyone can upload and download; only the admin (password-protected) can delete.

## Features
- Drag-and-drop upload with progress bar
- File list with size and upload date
- Download any file
- Admin-only delete, protected by a password (no user accounts needed)
- Modern, responsive, dark-themed UI

## Local setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values:
   ```
   MONGO_URI=your MongoDB Atlas connection string
   PORT=5000
   ADMIN_PASSWORD=pick a private password
   ```

3. Start the server:
   ```
   npm start
   ```

4. Open `http://localhost:5000`

## Deploying to Render

1. Push this project to GitHub.
2. On Render, create a new Web Service from your repo.
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Add environment variables in the Render dashboard:
   - `MONGO_URI`
   - `PORT` = `5000`
   - `ADMIN_PASSWORD` = your chosen password
4. In MongoDB Atlas, go to Network Access and allow `0.0.0.0/0` (Render's IPs aren't static).
5. Deploy. Your site will be live at `https://<your-service-name>.onrender.com`.

### Renaming your site
In Render, go to your service → Settings → change the service Name. Your URL becomes
`https://<new-name>.onrender.com` immediately — no separate purchase needed.

To use a real custom domain (e.g. `priyatham.dev`), buy the domain from any registrar,
then add it under Settings → Custom Domains in Render and follow the DNS instructions shown there.

## Important notes on Render's free tier
- The filesystem is **ephemeral** — uploaded files are wiped whenever the service restarts
  or redeploys. Fine for testing, but for a permanent file store, move uploads to a service
  like Amazon S3, Cloudinary, or Render's paid persistent disks.
- Free instances spin down after inactivity, so the first request after idle time can take
  ~30-50 seconds to respond.

## Security notes
- Change `ADMIN_PASSWORD` to something private before deploying — don't reuse example values.
- Rotate your MongoDB Atlas database password if it has ever been shared or pasted anywhere
  (chat, screenshots, commits). Update it in Atlas, your local `.env`, and Render's environment
  variables afterward.
- Never commit `.env` to git — it's already excluded via `.gitignore`.
