const fs = require("fs");
const { JSDOM } = require("jsdom");
const jsQR = require("jsqr");

const html = fs.readFileSync(__dirname + "/../docs/index.html", "utf8");
const BASE = "https://cartes.example.org/c.html";

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  ÉCHEC :", m);
  }
};
const eq = (a, b, m) =>
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    `${m}\n      obtenu  : ${JSON.stringify(a)}\n      attendu : ${JSON.stringify(b)}`,
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log("\n" + t);

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

function load(url) {
  const downloads = [];
  let copied = null;
  const dom = new JSDOM(html, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.Blob = function (parts, o) {
        this.parts = parts;
        this.type = o && o.type;
      };
      w.URL.createObjectURL = (b) => {
        downloads.push({ blob: b });
        return "blob:test/" + downloads.length;
      };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {
        if (this.download && downloads.length)
          downloads[downloads.length - 1].name = this.download;
      };
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = () => {};
      Object.defineProperty(w.navigator, "clipboard", {
        value: {
          writeText: async (t) => {
            copied = t;
          },
        },
      });
    },
  });
  return {
    w: dom.window,
    d: dom.window.document,
    downloads,
    getCopied: () => copied,
  };
}

function decodeSvg(svg) {
  const size = +svg.match(/viewBox="0 0 (\d+) \d+"/)[1];
  const scale = 8,
    W = size * scale;
  const data = new Uint8ClampedArray(W * W * 4).fill(255);
  const re = /M(\d+) (\d+)h(\d+)v1h-\d+z/g;
  let m;
  while ((m = re.exec(svg))) {
    const x = +m[1],
      y = +m[2],
      w = +m[3];
    for (let yy = y * scale; yy < (y + 1) * scale; yy++)
      for (let xx = x * scale; xx < (x + w) * scale; xx++) {
        const i = (yy * W + xx) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
  }
  const r = jsQR(data, W, W);
  return r && r.data;
}

const FULL = {
  first: "Jean-Éloïse",
  last: "Dupont d'Aubigné",
  org: 'Société Latellier & Fils; SARL, "Test"',
  title: "Directeur",
  mobile: "+33 6 12 34 56 78",
  phone: "02 97 00 00 00",
  email: "jean@exemple.fr",
  web: "exemple.fr/contact?x=1&y=2",
  street: "12 rue de la Paix",
  postal: "56000",
  city: "Vannes",
  country: "France",
  note: "Ligne 1\nLigne 2, avec; ponctuation \\ et emoji 😀",
};

(async () => {
  section("1. Carte complète : affichage");
  {
    const { w, d } = load(BASE + "#" + H(FULL));
    ok(
      !d.getElementById("view-card").hidden &&
        d.getElementById("view-edit").hidden,
      "vue carte affichée, éditeur masqué",
    );
    eq(
      d.getElementById("c-name").textContent,
      "Jean-Éloïse Dupont d'Aubigné",
      "nom",
    );
    eq(d.getElementById("c-avatar").textContent, "JD", "initiales");
    eq(
      d.getElementById("c-role").textContent,
      'Directeur · Société Latellier & Fils; SARL, "Test"',
      "fonction · société",
    );
    const rows = [...d.querySelectorAll("#c-rows li")];
    eq(rows.length, 6, "nombre de lignes");
    const hrefs = [...d.querySelectorAll("#c-rows a")].map((a) =>
      a.getAttribute("href"),
    );
    eq(
      hrefs,
      [
        "tel:+33612345678",
        "tel:0297000000",
        "mailto:jean@exemple.fr",
        "https://exemple.fr/contact?x=1&y=2",
      ],
      "liens",
    );
    const web = d.querySelector('#c-rows a[href^="https"]');
    eq(
      [web.target, web.rel],
      ["_blank", "noopener noreferrer"],
      "lien externe sécurisé",
    );
    ok(d.getElementById("c-share").hidden, "panneau QR fermé au départ");
    ok(
      d.getElementById("c-native").hidden,
      "bouton Partager masqué sans navigator.share",
    );
  }

  section("2. Téléchargement de la vCard");
  {
    const { w, d, downloads } = load(BASE + "#" + H(FULL));
    d.getElementById("c-save").click();
    eq(downloads.length, 1, "un téléchargement");
    eq(downloads[0].name, "jean-eloise-dupont-d-aubigne.vcf", "nom de fichier");
    eq(downloads[0].blob.type, "text/vcard;charset=utf-8", "type MIME");
    const text = downloads[0].blob.parts[0];
    ok(text.endsWith("END:VCARD\r\n"), "se termine par END:VCARD + CRLF");
    ok(!/[^\r]\n/.test(text), "aucun LF isolé (CRLF partout)");
    for (const phys of text.split("\r\n"))
      ok(Buffer.byteLength(phys) <= 75, "ligne ≤ 75 octets : " + phys);
    ok(!text.includes("�"), "aucun caractère de remplacement");
    const lines = text.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
    eq(
      lines,
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "N:Dupont d'Aubigné;Jean-Éloïse;;;",
        "FN:Jean-Éloïse Dupont d'Aubigné",
        'ORG:Société Latellier & Fils\\; SARL\\, "Test"',
        "TITLE:Directeur",
        "TEL;TYPE=CELL:+33 6 12 34 56 78",
        "TEL;TYPE=WORK,VOICE:02 97 00 00 00",
        "EMAIL;TYPE=INTERNET:jean@exemple.fr",
        "URL:https://exemple.fr/contact?x=1&y=2",
        "ADR;TYPE=WORK:;;12 rue de la Paix;Vannes;;56000;France",
        "NOTE:Ligne 1\\nLigne 2\\, avec\\; ponctuation \\\\ et emoji 😀",
        "END:VCARD",
      ],
      "contenu de la vCard",
    );
  }

  section("3. Pliage de lignes longues et caractères multi-octets");
  {
    const longNote = "é😀ü".repeat(60) + " fin";
    const { d, downloads } = load(
      BASE + "#" + H({ first: "A", last: "B", note: longNote }),
    );
    d.getElementById("c-save").click();
    const text = downloads[0].blob.parts[0];
    for (const phys of text.split("\r\n"))
      ok(Buffer.byteLength(phys) <= 75, "ligne pliée ≤ 75 octets");
    ok(
      text.split("\r\n").some((l) => l.startsWith(" ")),
      "au moins une ligne de continuation",
    );
    ok(!text.includes("�"), "aucun caractère coupé");
    const note = text
      .replace(/\r\n /g, "")
      .split("\r\n")
      .find((l) => l.startsWith("NOTE:"));
    eq(note, "NOTE:" + longNote, "note identique après dépliage");
  }

  section("4. Sécurité : injections dans l’URL");
  {
    const evil =
      "f=Eve&l=X&o=Acme%0D%0AEND%3AVCARD%0D%0ABEGIN%3AVCARD%0D%0AFN%3AHacker" +
      "&e=a%40b.fr%0D%0ABCC%3Ax%40y.z&w=javascript%3Aalert(1)&p=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E" +
      "&n=%3Cscript%3Ealert(1)%3C%2Fscript%3E";
    const { w, d, downloads } = load(BASE + "#" + evil);
    eq(d.querySelectorAll("script").length, 2, "aucun <script> ajouté");
    eq(d.querySelectorAll("img").length, 0, "aucune <img> injectée");
    eq(
      d.querySelectorAll('a[href^="javascript"]').length,
      0,
      "aucun lien javascript:",
    );
    ok(
      d
        .getElementById("c-rows")
        .textContent.includes("<img src=x onerror=alert(1)>"),
      "balise affichée comme texte",
    );
    ok(
      d
        .getElementById("c-rows")
        .textContent.includes("<script>alert(1)</script>"),
      "script affiché comme texte",
    );
    eq(
      d.querySelectorAll('#c-rows a[href^="http"]').length,
      0,
      "site invalide écarté",
    );
    d.getElementById("c-save").click();
    const text = downloads[0].blob.parts[0];
    const lines = text.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
    eq(
      lines.filter((l) => l === "BEGIN:VCARD").length,
      1,
      "un seul BEGIN:VCARD",
    );
    eq(lines.filter((l) => l === "END:VCARD").length, 1, "un seul END:VCARD");
    ok(!lines.some((l) => /^FN:Hacker/.test(l)), "pas de FN injecté");
    ok(!/BCC/.test(text), "e-mail piégé écarté");
    ok(!lines.some((l) => l.startsWith("EMAIL")), "aucune ligne EMAIL");
  }

  section("5. Normalisation des e-mails et sites web");
  {
    const { w } = load(BASE);
    const n = w.__contactCard.normalize;
    const web = (s) => n({ web: s }).web;
    eq(web("exemple.fr"), "https://exemple.fr/", "site sans schéma");
    eq(
      web("HTTP://Exemple.FR/a b"),
      "http://exemple.fr/ab",
      "http conservé, espaces retirés",
    );
    eq(web("ftp://x.fr"), "", "ftp refusé");
    eq(web("data:text/html,<b>x</b>"), "", "data: refusé");
    eq(web("javascript:alert(1)"), "", "javascript: refusé");
    eq(web("JaVaScRiPt:alert(1)"), "", "javascript: (casse mixte) refusé");
    eq(web("localhost:3000"), "https://localhost:3000/", "hôte:port");
    const em = (s) => n({ email: s }).email;
    eq(em("a@b.fr"), "a@b.fr", "e-mail valide");
    eq(em("a b@c.fr"), "", "espace refusé");
    eq(em("x@y"), "", "sans point refusé");
    eq(em("a@b.fr,c@d.fr"), "", "virgule refusée");
  }

  section("6. Aller-retour URL ↔ données");
  {
    const { w } = load(BASE);
    const { toHash, parseHash } = w.__contactCard;
    const weird = {
      first: "A&B=C#D%E+F é 😀",
      last: "Ñandú/?",
      org: "x=y&z=w",
      note: "l1\nl2 & l3 = 4 # 5 % 6 + 7",
    };
    eq(parseHash(toHash(weird)), weird, "caractères spéciaux");
    eq(
      parseHash("f=" + "a".repeat(100000)).first.length,
      80,
      "champ tronqué à 80 caractères",
    );
    eq(
      parseHash("#f=%E0%A4%A&l=OK"),
      { last: "OK" },
      "encodage invalide ignoré sans planter",
    );
    eq(parseHash("zz=1&=2&f"), {}, "clés inconnues ignorées");
    const { d } = load(BASE + "#f=%E0%A4%A");
    ok(
      !d.getElementById("view-edit").hidden,
      "URL cassée : retour à l’éditeur",
    );
  }

  section("7. QR code de la carte");
  {
    const { w, d } = load(BASE + "#" + H(FULL));
    d.getElementById("c-qr-toggle").click();
    ok(!d.getElementById("c-share").hidden, "panneau QR ouvert");
    eq(
      d.getElementById("c-qr-toggle").getAttribute("aria-expanded"),
      "true",
      "aria-expanded",
    );
    const svg = d.getElementById("c-qr").innerHTML;
    ok(svg.startsWith("<svg"), "SVG présent");
    const url = w.location.href;
    const decoded = decodeSvg(svg);
    eq(decoded, url, "le QR décodé est exactement l’URL de la page");
    ok(/^[\x21-\x7E]+$/.test(url), "URL 100 % ASCII");
    const m = svg.match(/viewBox="0 0 (\d+)/);
    console.log(
      `  (info : URL de ${url.length} caractères, QR de ${m[1] - 8} modules, version ${(m[1] - 8 - 17) / 4})`,
    );
    eq(d.getElementById("c-url").value, url, "champ lien = URL");
    d.getElementById("c-qr-toggle").click();
    ok(d.getElementById("c-share").hidden, "panneau QR refermé");
  }

  section("8. Boutons de partage");
  {
    const { w, d, getCopied } = load(
      BASE + "#" + H({ first: "Jean", last: "Dupont", mobile: "+33 6 12" }),
    );
    const url = w.location.href;
    const sms = d.getElementById("c-sms").getAttribute("href");
    ok(sms.startsWith("sms:?&body="), "format SMS");
    ok(
      decodeURIComponent(sms.split("body=")[1]).includes(url),
      "SMS contient l’URL exacte",
    );
    const mail = d.getElementById("c-mail").getAttribute("href");
    ok(mail.startsWith("mailto:?subject="), "format mailto");
    eq(
      decodeURIComponent(mail.match(/subject=([^&]*)/)[1]),
      "Carte de contact — Jean Dupont",
      "sujet du mail",
    );
    ok(
      decodeURIComponent(mail.split("body=")[1]).includes(url),
      "mail contient l’URL exacte",
    );
    d.getElementById("c-copy").click();
    await sleep(20);
    eq(getCopied(), url, "copie dans le presse-papiers");
    eq(d.getElementById("c-copy").textContent, "Copié ✓", "retour visuel");
  }

  section("9. Éditeur : création d’un lien");
  {
    const { w, d } = load(BASE);
    ok(
      !d.getElementById("view-edit").hidden &&
        d.getElementById("view-card").hidden,
      "sans données : éditeur affiché",
    );
    eq(
      d.querySelectorAll("#e-form input, #e-form textarea").length,
      13,
      "13 champs",
    );
    ok(d.getElementById("e-open").disabled, "bouton Ouvrir désactivé sans nom");
    ok(
      d
        .getElementById("e-warns")
        .textContent.includes("au moins un prénom ou un nom"),
      "avertissement sans nom",
    );
    const set = (id, v) => {
      const el = d.getElementById("i-" + id);
      el.value = v;
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
    };
    set("first", "Jean");
    set("last", "Dupont");
    set("mobile", "06 12 34 56 78");
    set("email", "jean@exemple.fr");
    set("web", "exemple.fr");
    const url = d.getElementById("e-url").value;
    eq(
      url,
      BASE +
        "#f=Jean&l=Dupont&p=06%2012%2034%2056%2078&e=jean%40exemple.fr&w=https%3A%2F%2Fexemple.fr%2F",
      "URL générée",
    );
    ok(!d.getElementById("e-open").disabled, "bouton Ouvrir activé");
    eq(
      decodeSvg(d.getElementById("e-qr").innerHTML),
      url,
      "QR de l’éditeur décodé = URL générée",
    );
    set("email", "pas un mail");
    ok(
      d
        .getElementById("e-warns")
        .textContent.includes("e-mail semble invalide"),
      "avertissement e-mail invalide",
    );
    ok(
      !d.getElementById("e-url").value.includes("e="),
      "e-mail invalide absent du lien",
    );
    set("email", "jean@exemple.fr");
    set("web", "javascript:alert(1)");
    ok(
      d.getElementById("e-warns").textContent.includes("http ou https"),
      "avertissement site invalide",
    );
    set("web", "exemple.fr");
    d.getElementById("e-open").click();
    await sleep(60);
    ok(
      !d.getElementById("view-card").hidden,
      "carte affichée après « Ouvrir »",
    );
    eq(w.location.hash.slice(1), url.split("#")[1], "fragment mis à jour");
    eq(
      d.getElementById("c-name").textContent,
      "Jean Dupont",
      "nom sur la carte",
    );
  }

  section("10. Modifier une carte existante");
  {
    const { w, d } = load(
      BASE + "#" + H({ first: "Jean", last: "Dupont", org: "ACME" }),
    );
    d.getElementById("c-edit").click();
    ok(!d.getElementById("view-edit").hidden, "éditeur ouvert");
    eq(
      [
        d.getElementById("i-first").value,
        d.getElementById("i-last").value,
        d.getElementById("i-org").value,
      ],
      ["Jean", "Dupont", "ACME"],
      "champs préremplis",
    );
    ok(!d.getElementById("e-back-wrap").hidden, "lien « revenir » visible");
    const set = (id, v) => {
      const el = d.getElementById("i-" + id);
      el.value = v;
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
    };
    set("first", "Paul");
    d.getElementById("e-back").click();
    eq(
      d.getElementById("c-name").textContent,
      "Jean Dupont",
      "annulation : ancienne carte",
    );
    d.getElementById("c-edit").click();
    set("first", "Paul");
    d.getElementById("e-open").click();
    await sleep(60);
    eq(
      d.getElementById("c-name").textContent,
      "Paul Dupont",
      "modification appliquée",
    );
    d.getElementById("c-edit").click();
    d.getElementById("e-open").click();
    await sleep(60);
    ok(
      !d.getElementById("view-card").hidden,
      "ouvrir sans changement : retour à la carte",
    );
  }

  section("11. Limites de taille du QR code");
  {
    const big = {
      first: "A",
      last: "B",
      org: "o".repeat(80),
      title: "t".repeat(80),
      email: "e".repeat(40) + "@exemple.fr",
      web: "exemple.fr/" + "p".repeat(150),
      street: "s".repeat(120),
      city: "c".repeat(60),
      country: "y".repeat(60),
      note: "n".repeat(300),
    };
    const { w, d } = load(BASE + "#" + H(big));
    d.getElementById("c-qr-toggle").click();
    const svg = d.getElementById("c-qr").innerHTML;
    const url = w.location.href;
    console.log(`  (info : cas maximal ASCII = ${url.length} caractères)`);
    ok(svg.startsWith("<svg"), "QR généré pour le cas maximal ASCII");
    eq(decodeSvg(svg), url, "QR du cas maximal décodé");
    const huge = {
      first: "é".repeat(80),
      last: "é".repeat(80),
      org: "é".repeat(80),
      title: "é".repeat(80),
      note: "é".repeat(300),
    };
    const t = load(BASE + "#" + H(huge));
    console.log(
      `  (info : cas extrême multi-octets = ${t.w.location.href.length} caractères)`,
    );
    t.d.getElementById("c-qr-toggle").click();
    ok(
      t.d.getElementById("c-qr").textContent.length > 0 ||
        t.d.getElementById("c-qr").innerHTML.startsWith("<svg"),
      "cas extrême : message ou QR, pas de panneau vide",
    );
  }

  section("12. Aucun accès réseau, politique de sécurité");
  {
    ok(
      /Content-Security-Policy" content="default-src 'none'/.test(html),
      "CSP default-src none",
    );
    const dom = new JSDOM(html);
    const dd = dom.window.document;
    const ext = [...dd.querySelectorAll("[src],[href]")]
      .map((e) => e.getAttribute("src") || e.getAttribute("href"))
      .filter((u) => /^(https?:)?\/\//i.test(u));
    eq(ext, [], "aucune ressource externe");
    const app = html.slice(html.indexOf("(function () {\n  'use strict';"));
    for (const bad of [
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "sendBeacon",
      "localStorage",
      "sessionStorage",
      "document.cookie",
      "import(",
      "eval(",
      "new Function",
    ])
      ok(!app.includes(bad), "le code applicatif ne contient pas " + bad);
    ok(
      !/innerHTML\s*=\s*[^'"\n]*(?:d\.|n\.|raw|clean_|val)/.test(app),
      "innerHTML jamais alimenté par des données saisies",
    );
    console.log(
      "  (info : innerHTML utilisé uniquement pour",
      [...app.matchAll(/innerHTML\s*=\s*([^;]{0,60})/g)]
        .map((m) => m[1].trim())
        .join(" | "),
      ")",
    );
  }

  console.log(`\n${pass} vérifications réussies, ${fail} échec(s)`);
  process.exit(fail ? 1 : 0);
})();
