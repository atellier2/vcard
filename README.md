➡️ https://atellier2.github.io/vcard

# Carte de contact

Page web unique qui génère une carte de contact numérique : on saisit ses coordonnées, on obtient un lien (et un QR code) qui ouvre la carte, avec un bouton « Enregistrer dans mes contacts » (fichier vCard `.vcf`).

**Aucun serveur, aucune requête réseau.** Toutes les données sont dans le fragment de l'URL (la partie après `#`), que le navigateur n'envoie jamais au serveur. Une politique de sécurité (CSP) interdit en outre toute connexion sortante.

## Utilisation

1. Ouvrez la page publiée (voir « Déploiement »).
2. Renseignez vos coordonnées (au moins un prénom ou un nom).
3. Copiez le lien généré ou scannez le QR code : la page s'ouvre alors en mode carte.
4. Depuis la carte : enregistrer le contact, afficher/télécharger le QR code (SVG ou PNG), partager par SMS, e-mail ou partage natif, ou modifier la carte.

Exemple de lien : `https://<utilisateur>.github.io/<dépôt>/#f=Ada&l=Lovelace&o=Analytical%20Engine&e=ada%40example.org`

> Ouverte depuis un fichier local (`file://`), la page fonctionne mais les liens générés ne sont pas utilisables par d'autres personnes : il faut la servir en HTTPS.

## Structure

```
src/app.html       source à modifier (modèle HTML/CSS/JS avec le marqueur /*__QRLIB__*/)
scripts/build.js   insère la bibliothèque qrcode-generator dans le modèle
tests/test.js      tests unitaires et d'intégration (jsdom)
tests/e2e.js       tests navigateur (Playwright), à adapter à votre environnement
docs/index.html    page générée, servie par GitHub Pages (ne pas modifier à la main)
```

## Développement

Prérequis : Node.js.

```sh
npm install
npm run build   # src/app.html -> docs/index.html
npm test        # build puis tests (jsdom)
```

Modifiez toujours `src/app.html`, puis relancez le build et commitez **les deux** fichiers : GitHub Pages sert `docs/index.html` tel quel.

## Déploiement sur GitHub Pages

1. Poussez le dépôt sur GitHub.
2. *Settings → Pages* : source « Deploy from a branch », branche `main`, dossier `/docs`.
3. La carte est disponible à `https://<utilisateur>.github.io/<dépôt>/`.

Le fichier `docs/.nojekyll` désactive le traitement Jekyll.

## Format du lien

Chaque champ est une clé courte dans le fragment, valeur encodée en URL :

| Clé | Champ | Clé | Champ |
|-----|-------|-----|-------|
| `f` | prénom | `e` | e-mail |
| `l` | nom | `w` | site web |
| `o` | société | `r` | adresse |
| `t` | fonction | `z` | code postal |
| `p` | mobile | `c` | ville |
| `q` | téléphone fixe | `y` | pays |
| `n` | note | | |

## Licence et dépendances

Le QR code est généré par [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), intégré dans la page au moment du build.
