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

## Prix conseillé

Après le dépôt du fichier comparatif, déposer le fichier des **prix d'achat** (l'export « État des stocks » de Planity convient) (bouton « Télécharger le modèle à remplir » pour en avoir un pré-rempli avec les produits) : Marque, Titre du produit, Prix d'achat HT (€). Le **coût d'envoi** se saisit sur la page : coût par commande (emballage + transport), nombre moyen de produits par commande et frais de port payés par le client. Option : temps de préparation par commande (min) et coût horaire chargé (€/h) du personnel. Coût par produit = (coût par commande − port payé par le client + temps × coût horaire) ÷ produits par commande.

- **Prix plancher** = (prix d'achat HT + coût d'envoi par produit) × (1 + marge minimum) × (1 + TVA), arrondi au ,99 supérieur.
- **Prix conseillé** = médiane des concurrents en stock × (1 + positionnement), limitée à ± variation max autour du prix actuel, arrondie au ,99, jamais sous le prix plancher.
- « Garder » si l'écart avec le prix actuel est inférieur à 1 €.
- Réglages (positionnement, marge minimum, TVA, variation max, coût d'envoi par commande, produits par commande, port payé par le client) modifiables sur la page ; ils sont mémorisés dans le navigateur.
- **Boutiques physiques** (option) : prix plancher sans coût d'envoi = prix d'achat HT × (1 + marge minimum) × (1 + TVA) ; prix conseillé boutique = prix conseillé site ± l'écart choisi (%), arrondi au ,99, jamais sous le plancher boutique. Colonnes « Prix plancher boutique » et « Prix conseillé boutique ».
- Colonnes ajoutées au fichier : Prix d'achat HT, Coût d'envoi, Prix plancher, Prix conseillé, Conseil.

### Correspondance des produits

Pour chaque produit, le prix d'achat est cherché dans cet ordre :
1. **code-barres / EAN** (colonne « Code-barres » du comparatif ↔ colonne EAN / code-barres du fichier des prix d'achat) ;
2. **nom exact** (marque + titre, ou titre seul) ;
3. **nom approché** : mots du titre en commun, sans contenances (80ml, x80…), marque éventuellement abrégée (« ABI » pour Abib). Retenu seulement si la correspondance est nette.

La page indique combien de produits ont été retrouvés par chaque méthode et liste ceux qui n'ont pas de prix d'achat.

## Format attendu du fichier

- Colonnes `… (Lien)` suivies chacune de leur colonne de prix `… (€)`.
- Colonnes `Marque`, `Titre du produit`, `Mon Prix (€)` et, en option, `Statut` (valeur « en ligne »).
- Un lien peut être une URL, un lien hypertexte ou une formule `=HYPERLINK("url";"…")`.
- Quand un prix n'est pas trouvé, la cellule du lien reçoit une note : `introuvable`, `prix non lu` ou `erreur`.
- Ruptures de stock : la colonne `Ruptures concurrents` (créée automatiquement) liste les sites où le produit est en rupture, et la cellule de prix concernée reçoit la note « Rupture de stock ».

## Fonctionnement

- `public/index.html` : lit et réécrit le fichier dans le navigateur (ExcelJS), appelle l'API lien par lien (3 en parallèle).
- `api/price.js` : une fonction Vercel ouvre le lien dans un Chromium allégé (`@sparticuz/chromium`), trouve le produit et lit le prix :
  - boutiques Shopify : `compare_at_price` sinon `price` (`/products/xxx.js`) ;
  - autres sites : prix barré de la page, sinon prix des données structurées ;
  - prix en USD convertis en EUR au taux du jour ;
  - stock : disponibilité Shopify, sinon `availability` des données structurées, sinon mentions « rupture / épuisé / sold out » dans la zone produit.

Valeurs par défaut (estimation du 26/10/2026) : 11,15 € par commande, dont 9,18 € de Colissimo payés par le client, soit 1,97 € d'emballage restant à la charge de Point n., réparti sur 3 produits.
