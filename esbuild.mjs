import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  minify: !watch,
  platform: "node",
  sourcemap: watch,
  target: "node18",
  outfile: "dist/extension.js",
  logLevel: "info"
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
