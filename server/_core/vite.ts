import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    console.error(`Build directory NOT FOUND: ${distPath}`);
  }

  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Error: index.html not found. Make sure to run 'vite build'.");
    }
  });
}

export async function setupVite(app: Express, server: any) {
    // Ova funkcija ostaje ista za razvoj (development) mod
}