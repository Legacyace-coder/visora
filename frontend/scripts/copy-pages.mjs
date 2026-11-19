import { mkdir, copyFile, cp } from "node:fs/promises";

await mkdir("dist", { recursive: true });

const pages = [
  "index.html",
  "about.html",
  "collection.html",
  "photographers.html",
  "login.html",
  "register.html",
  "photographer/dashboard.html",
  "agent/dashboard.html",
  "admin/dashboard.html",
];

for (const page of pages) {
  const destination = `dist/${page}`;
  const directory = destination.slice(0, destination.lastIndexOf("/"));

  if (directory !== destination) {
    await mkdir(directory, { recursive: true });
  }

  await copyFile(page, destination);
}

await cp("images", "dist/images", { recursive: true });
console.log("HTML pages and image assets copied to dist.");