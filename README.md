# Comparateur de prix — Point n.

Page en ligne : on dépose le fichier comparatif, l'outil relève le **prix hors promo** de chaque concurrent, remplit les colonnes de prix et affiche le positionnement (moins cher / aligné / plus cher).

## Mise en ligne sur Vercel (une seule fois)

1. Mettre ce dossier dans un dépôt GitHub.
2. Sur vercel.com : **Add New → Project**, importer le dépôt, laisser les réglages par défaut (pas de framework), **Deploy**.
3. Partager l'URL obtenue (`https://….vercel.app`) avec l'équipe.

Aucune variable d'environnement n'est nécessaire. Option : `ALLOWED_HOSTS` pour changer la liste des sites concurrents autorisés (séparés par des virgules).

## Utilisation (chaque mois)

1. Ouvrir la page et déposer le fichier comparatif (.xlsx ou .csv).
2. Laisser cochée « Uniquement les produits en ligne » pour aller deux fois plus vite.
3. Cliquer sur **Lancer l'analyse** et **garder l'onglet ouvert**. En cas de fermeture, redéposer le même fichier dans les 3 jours : l'analyse reprend où elle s'était arrêtée.
4. À la fin : consulter le récapitulatif, puis **Télécharger le fichier mis à jour** (daté du jour). C'est ce fichier qu'il faut réutiliser le mois suivant.

Le premier passage est le plus long : les liens de recherche sont remplacés par les liens directs des produits, ce qui accélère les mois suivants.

## Format attendu du fichier

- Colonnes `… (Lien)` suivies chacune de leur colonne de prix `… (€)`.
- Colonnes `Marque`, `Titre du produit`, `Mon Prix (€)` et, en option, `Statut` (valeur « en ligne »).
- Un lien peut être une URL, un lien hypertexte ou une formule `=HYPERLINK("url";"…")`.
- Quand un prix n'est pas trouvé, la cellule du lien reçoit une note : `introuvable`, `prix non lu` ou `erreur`.

## Fonctionnement

- `public/index.html` : lit et réécrit le fichier dans le navigateur (ExcelJS), appelle l'API lien par lien (3 en parallèle).
- `api/price.js` : une fonction Vercel ouvre le lien dans un Chromium allégé (`@sparticuz/chromium`), trouve le produit et lit le prix :
  - boutiques Shopify : `compare_at_price` sinon `price` (`/products/xxx.js`) ;
  - autres sites : prix barré de la page, sinon prix des données structurées ;
  - prix en USD convertis en EUR au taux du jour.
