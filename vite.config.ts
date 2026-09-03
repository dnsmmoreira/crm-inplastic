// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Identificador de build: publicado em `/version.json` e embutido no bundle
 * como `import.meta.env.VITE_BUILD_ID`. O cliente compara os dois para
 * detectar aba com bundle antigo (ver src/lib/bundle-guard.ts).
 */
const BUILD_ID = process.env["VITE_BUILD_ID"] ?? String(Date.now());
const VERSION_JSON = JSON.stringify({ buildId: BUILD_ID });

function buildVersionPlugin() {
  return {
    name: "crm-build-version",
    config() {
      return {
        define: {
          "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
        },
      };
    },
    configureServer(server: {
      middlewares: {
        use: (
          path: string,
          fn: (
            req: unknown,
            res: {
              setHeader: (k: string, v: string) => void;
              end: (body: string) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use("/version.json", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.end(VERSION_JSON);
      });
    },
    generateBundle(this: {
      environment?: { name?: string };
      emitFile: (f: { type: "asset"; fileName: string; source: string }) => void;
    }) {
      const env = this.environment?.name;
      if (env && env !== "client") return;
      this.emitFile({ type: "asset", fileName: "version.json", source: VERSION_JSON });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin(), buildVersionPlugin()],
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
});
