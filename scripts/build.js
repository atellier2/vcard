// Assemble docs/index.html : modèle + bibliothèque qrcode-generator (MIT) en ligne.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const tpl = fs.readFileSync(path.join(root, "src", "app.html"), "utf8");
const lib = fs.readFileSync(
  path.join(root, "node_modules", "qrcode-generator", "dist", "qrcode.js"),
  "utf8",
);

if (/<\/script/i.test(lib))
  throw new Error("La bibliothèque contient </script : inlining impossible");
if (!tpl.includes("/*__QRLIB__*/"))
  throw new Error("Marqueur absent du modèle");

const out = tpl.replace("/*__QRLIB__*/", () => lib);
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs", "index.html"), out);
console.log("docs/index.html :", Buffer.byteLength(out), "octets");
