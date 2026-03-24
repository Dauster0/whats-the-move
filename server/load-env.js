/**
 * Loaded with: node --import ./load-env.js index.js
 * Runs before any other module so process.env is ready before imports that might read it.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env"), override: true });
process.env._DOTENV_LOADED_VIA_IMPORT = "1";
