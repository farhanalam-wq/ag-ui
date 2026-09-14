import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

let cachedDistDir: string | null = null;

function getDistDir(): string | null {
  if (cachedDistDir && fs.existsSync(cachedDistDir)) {
    return cachedDistDir;
  }

  try {
    const pkgPath = require.resolve("@thesvg/icons/package.json");
    const dist = path.join(path.dirname(pkgPath), "dist");
    if (fs.existsSync(dist)) {
      cachedDistDir = dist;
      return dist;
    }
  } catch {
    // Fallback search paths
  }

  const fallbackPaths = [
    path.resolve(process.cwd(), "node_modules/@thesvg/icons/dist"),
    path.resolve(process.cwd(), "../../node_modules/@thesvg/icons/dist"),
    path.resolve(process.cwd(), "packages/genui/node_modules/@thesvg/icons/dist"),
  ];

  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) {
      cachedDistDir = p;
      return p;
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }

  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
  const distDir = getDistDir();

  if (!distDir) {
    return NextResponse.json({ error: "Icon distribution directory not found" }, { status: 500 });
  }

  const filePath = path.join(distDir, `${cleanSlug}.js`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: `Icon '${cleanSlug}' not found` }, { status: 404 });
  }

  try {
    const code = fs.readFileSync(filePath, "utf-8");
    const svgMatch = code.match(/export const svg = `([\s\S]*?)`;/);
    const hexMatch = code.match(/export const hex = "([^"]*)";/);
    const titleMatch = code.match(/export const title = "([^"]*)";/);

    if (svgMatch && svgMatch[1]) {
      return NextResponse.json(
        {
          slug: cleanSlug,
          title: titleMatch ? titleMatch[1] : cleanSlug,
          hex: hexMatch ? hexMatch[1] : "71717A",
          svg: svgMatch[1],
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch {
    // Graceful error
  }

  return NextResponse.json({ error: `Failed to parse icon '${cleanSlug}'` }, { status: 500 });
}
