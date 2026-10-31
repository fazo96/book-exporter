// Lets plain Node load the app's server modules the way Next resolves them
// (tests/hooks.mjs): used by `npm test` (through tests/setup.mjs) and the CLI.
import { register } from "node:module";

register("../tests/hooks.mjs", import.meta.url);
