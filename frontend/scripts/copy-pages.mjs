import { mkdir, copyFile } from "node:fs/promises";

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

console.log("HTML pages copied to dist.");