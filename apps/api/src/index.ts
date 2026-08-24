import { buildApp } from "./app.js";
import { config } from "./lib/config.js";

// This is the entry point of your backend — the file that starts your server.

buildApp()
  .then((app) => app.listen({ port: config.port, host: config.host }))
  .then(() => console.log(`API running on http://${config.host}:${config.port}`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
