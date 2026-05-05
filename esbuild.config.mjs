import esbuild from "esbuild";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2018",
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  platform: "node",
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
