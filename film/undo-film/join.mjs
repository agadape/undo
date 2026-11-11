// index.html = world.part (renderer, world, grade) + cast.part (guardian, thief, phone, coins) + film.part (the film, second by second)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const parts = (process.argv[2] || "world.part,cast.part,film.part").split(",");
const html = parts.map((p) => fs.readFileSync(path.join(here, p), "utf8")).join("");
fs.writeFileSync(path.join(here, process.argv[3] || "index.html"), html);
console.log(process.argv[3] || "index.html", html.length, "bytes from", parts.join(" + "));
