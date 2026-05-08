import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];

function resolveAliasPath(specifier) {
  const rawPath = specifier.slice(2);
  const basePath = path.join(SRC_ROOT, rawPath);

  const candidates = [
    basePath,
    ...EXTENSIONS.map((ext) => `${basePath}${ext}`),
    ...EXTENSIONS.map((ext) => path.join(basePath, `index${ext}`)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const resolvedPath = resolveAliasPath(specifier);
    if (resolvedPath) {
      return {
        url: pathToFileURL(resolvedPath).href,
        shortCircuit: true,
      };
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}
