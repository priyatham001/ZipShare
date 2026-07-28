const uploadForm = document.getElementById("uploadForm");
const zipInput = document.getElementById("zipInput");
const statusMsg = document.getElementById("statusMsg");
const fileList = document.getElementById("fileList");

// Handle upload
uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!zipInput.files.length) return;

  const formData = new FormData();
  formData.append("zipfile", zipInput.files[0]);

  statusMsg.textContent = "Uploading...";

  try {
    const response = await fetch("/files", {
      method: "POST",
      body: formData
    });
    const data = await response.json();

    if (data.success) {
      statusMsg.textContent = "Upload successful!";
      uploadForm.reset();
      loadFiles();
    } else {
      statusMsg.textContent = "Upload failed: " + data.message;
    }
  } catch (err) {
    statusMsg.textContent = "Upload failed: " + err.message;
  }
});

// Load and render the file list
async function loadFiles() {
  const response = await fetch("/files");
  const files = await response.json();

  fileList.innerHTML = "";

  if (files.length === 0) {
    fileList.innerHTML = "<p>No files uploaded yet.</p>";
    return;
  }

  files.forEach((file) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>📦 ${file.originalname}</h3>
      <p><b>Size:</b> ${(file.size / 1024).toFixed(2)} KB</p>
      <p><b>Uploaded:</b> ${new Date(file.uploadDate).toLocaleString()}</p>
      <a href="/uploads/${file.filename}" download>
        <button>⬇ Download</button>
      </a>
      <button class="deleteBtn" data-id="${file._id}">🗑 Delete</button>
    `;
    fileList.appendChild(card);
  });

  document.querySelectorAll(".deleteBtn").forEach((btn) => {
    btn.addEventListener("click", () => deleteFile(btn.dataset.id));
  });
}

async function deleteFile(id) {
  if (!confirm("Delete this file?")) return;
  await fetch("/files/" + id, { method: "DELETE" });
  loadFiles();
}

loadFiles();
