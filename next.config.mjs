import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Home directory has its own package-lock.json; pin tracing to this app
  // so Next doesn't treat C:\Users\ljcir as the workspace root.
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
