const { chromium } = require("/opt/npm-tools/node_modules/playwright");
const fs = require("fs");
const { PNG } = require("pngjs");
const jsQR = require("jsqr");
const KEYS = {
  first: "f",
  last: "l",
  org: "o",
  title: "t",
  mobile: "p",
  phone: "q",
  email: "e",
  web: "w",
  street: "r",
  postal: "z",
  city: "c",
  country: "y",
  note: "n",
};
const H = (o) =>
  Object.entries(o)
    .map(([f, v]) => KEYS[f] + "=" + encodeURIComponent(v))
    .join("&");
const card = {
  first: "Jean",
  last: "Dupont",
  org: "Latellier Conseil",
  title: "Directeur",
  mobile: "06 12 34 56 78",
  email: "jean.dupont@latellier.fr",
  web: "latellier.fr",
  street: "12 rue de la Paix",
  postal: "56000",
  city: "Vannes",
  country: "France",
};
const URL_ = "http://127.0.0.1:8765/index.html";
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "  ok   " : "  ÉCHEC ") + m);
  if (!c) fails++;
};
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
      acceptDownloads: true,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const reqs = [];
    page.on("request", (r) => reqs.push(r.url()));
    await page.goto(URL_ + "#" + H(card));
    await page.screenshot({ path: `shots/card-${scheme}.png`, fullPage: true });
    await page.click("#c-qr-toggle");
    await page.screenshot({ path: `shots/qr-${scheme}.png`, fullPage: true });
    if (scheme === "light") {
      const [dl] = await Promise.all([
        page.waitForEvent("download"),
        page.click("#c-save"),
      ]);
      const p = await dl.path();
      const txt = fs.readFileSync(p, "utf8");
      ok(
        dl.suggestedFilename() === "jean-dupont.vcf",
        "vCard : nom de fichier " + dl.suggestedFilename(),
      );
      ok(
        txt.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nN:Dupont;Jean;;;") &&
          txt.includes("TEL;TYPE=CELL:06 12 34 56 78") &&
          txt.includes("EMAIL;TYPE=INTERNET:jean.dupont@latellier.fr"),
        "vCard : contenu réel téléchargé par Chrome",
      );
      const [dp] = await Promise.all([
        page.waitForEvent("download"),
        page.click("#c-dl-png"),
      ]);
      const png = PNG.sync.read(fs.readFileSync(await dp.path()));
      const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      ok(
        r && r.data === page.url(),
        "PNG du QR (canvas) décodé = URL de la page (" + png.width + "px)",
      );
      const [ds] = await Promise.all([
        page.waitForEvent("download"),
        page.click("#c-dl-svg"),
      ]);
      ok(
        fs.readFileSync(await ds.path(), "utf8").startsWith("<svg"),
        "SVG du QR téléchargé",
      );
      // QR affiché à l'écran : capture de l'élément puis décodage
      await page
        .locator("#c-qr svg")
        .screenshot({ path: "shots/qr-element.png" });
      const sp = PNG.sync.read(fs.readFileSync("shots/qr-element.png"));
      const sr = jsQR(new Uint8ClampedArray(sp.data), sp.width, sp.height);
      ok(
        sr && sr.data === page.url(),
        "QR affiché à l’écran, photographié par Chrome, décodé = URL",
      );
      // contenu des liens
      ok(
        (await page.getAttribute("#c-sms", "href")).startsWith("sms:?&body="),
        "lien SMS",
      );
    }
    ok(
      errors.length === 0,
      "aucune erreur console (" + scheme + ") " + errors.join("|"),
    );
    ok(
      reqs.every(
        (u) =>
          u.startsWith("http://127.0.0.1:8765/") ||
          u.startsWith("data:") ||
          u.startsWith("blob:"),
      ),
      "aucune requête externe (" + scheme + ") " + reqs.length + " requête(s)",
    );
    await ctx.close();
  }
  // éditeur
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.fill("#i-first", "Jean");
  await page.fill("#i-last", "Dupont");
  await page.fill("#i-org", "Latellier Conseil");
  await page.fill("#i-mobile", "06 12 34 56 78");
  await page.fill("#i-email", "jean.dupont@latellier.fr");
  await page.fill("#i-web", "latellier.fr");
  await page.screenshot({ path: "shots/edit-light.png", fullPage: true });
  const generated = await page.inputValue("#e-url");
  await page.click("#e-open");
  await page.waitForSelector("#view-card:not([hidden])");
  ok(
    page.url() === generated,
    "éditeur → carte : l’URL du navigateur est l’URL générée",
  );
  // plus large : bureau
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click("#c-qr-toggle");
  await page.screenshot({ path: "shots/desktop.png", fullPage: true });
  await browser.close();
  console.log(fails ? `\n${fails} échec(s)` : "\nTout est bon");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
