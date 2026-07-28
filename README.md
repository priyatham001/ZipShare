# ZipShare

Share `.zip` files instantly. Anyone with the link can upload and download —
only the admin (password-protected) can delete.

## Stack
- Node.js + Express
- MongoDB (Atlas or local) via Mongoose — stores file metadata
- Multer — handles the actual file storage on disk (`/uploads`)
- Vanilla HTML/CSS/JS frontend, no build step

## Local setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```
MONGO_URI=your-mongodb-connection-string
ADMIN_PASSWORD=pick-a-password
PORT=5000
```

Run it:
```bash
npm start
```

Visit `http://localhost:5000`.

## How admin-only delete works
- Every visitor can upload and download freely.
- Clicking **Admin** opens a password prompt. The password is checked
  against `ADMIN_PASSWORD` on the server (`POST /api/files/admin/login`)
  and never stored in the codebase or the database.
- Once unlocked, delete buttons appear next to each file for that browser
  tab (stored in `sessionStorage`, cleared when the tab closes or you
  click **Admin** again to lock it).
- The actual delete request (`DELETE /api/files/:id`) is re-checked
  against `ADMIN_PASSWORD` on the server, so the button showing up in the
  UI is a convenience, not the real security boundary.

## Deploying (e.g. Render)
1. Push this project to GitHub.
2. Create a new Web Service on Render pointing at the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. In the Render dashboard → **Environment**, add:
   - `MONGO_URI` — your MongoDB Atlas connection string
   - `ADMIN_PASSWORD` — your chosen admin password
4. Save and let it redeploy. Watch **Logs** for:
   ```
   MongoDB connected
   Server running on port 5000
   ```
5. Open your live URL and test upload, download, admin unlock, and delete.

> Note: Render's free-tier disks are ephemeral — uploaded files can be
> wiped on redeploy/restart. For persistent storage in production, swap
> the disk storage in `routes/fileRoutes.js` for a service like
> Cloudinary, S3, or Render's paid persistent disks.

## Project structure
```
zipshare/
├── models/File.js         # Mongoose schema for file metadata
├── routes/fileRoutes.js   # upload / list / download / delete / admin login
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── uploads/                # uploaded .zip files land here
├── server.js
├── package.json
└── .env.example
```
