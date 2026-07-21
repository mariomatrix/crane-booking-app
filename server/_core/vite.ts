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
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { 
      middlewareMode: true,
      hmr: { server }
    },
    appType: "custom",
    root: path.resolve(process.cwd(), "client")
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientIndexHtml = path.resolve(process.cwd(), "client", "index.html");
      let template = fs.readFileSync(clientIndexHtml, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}