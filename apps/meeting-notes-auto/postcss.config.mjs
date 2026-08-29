// Empty on purpose — this app uses plain CSS, no Tailwind. Without this
// file, Next.js's postcss config lookup walks up the directory tree and
// picks up the parent repo's postcss.config.mjs (which requires
// tailwindcss/autoprefixer, not installed in this app's node_modules),
// breaking the Vercel build for this app.
const config = { plugins: {} };

export default config;
