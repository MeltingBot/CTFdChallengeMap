# CTFd Map - Build Process

Ce guide explique comment créer des versions minifiées des fichiers JavaScript pour la production.

## 🎯 Objectif

Le processus de build génère des versions minifiées des fichiers JavaScript tout en préservant les originaux :
- `app.js` → `app.min.js` 
- `app-d3.js` → `app-d3.min.js`
- `index.html` → `index.prod.html`

## 🚀 Commandes de Build

### Build standard
```bash
npm run build
```

### Build avec surveillance (rebuild automatique)
```bash
npm run build:watch
```

## 📦 Fichiers générés

Après le build, les fichiers suivants sont créés :

### Fichiers JavaScript minifiés
- **app.min.js** - Version minifiée de app.js (~61% de réduction)
- **app-d3.min.js** - Version minifiée de app-d3.js (~54% de réduction)

### Fichier HTML de production
- **index.prod.html** - Version de index.html utilisant les scripts minifiés

### Informations de build
- **build-info.json** - Statistiques détaillées du build

## ⚙️ Configuration du Build

Le build utilise [Terser](https://terser.org/) avec la configuration suivante :

### Optimisations appliquées
- ✅ **Compression du code** - Suppression des espaces et optimisations
- ✅ **Suppression des fonctions de debug** - `debugLog()` supprimé en production
- ✅ **Suppression du code mort** - Code non utilisé retiré
- ✅ **Minification des noms** - Variables renommées (avec exceptions)
- ❌ **Conservation des console.log** - Gardés pour le debugging

### Fonctions préservées
Les fonctions globales importantes sont préservées pour maintenir la compatibilité :
- Fonctions de connexion : `connectToAPI`, `logout`, `refreshData`
- Gestion des équipes : `toggleTeam`, `selectAllTeams`, etc.
- Contrôles D3 : `zoomIn`, `resetView`, `togglePathAnimation`, etc.
- Interface : `setViewMode`, `showAboutModal`, etc.

## 🎯 Utilisation en Production

### 1. Développement
Utilisez les fichiers originaux pour le développement :
```html
<script src="app-d3.js"></script>
<script src="app.js"></script>
```

### 2. Production
Utilisez `index.prod.html` ou référencez les fichiers minifiés :
```html
<script src="app-d3.min.js"></script>
<script src="app.min.js"></script>
```

## 📊 Statistiques de Performance

Réduction typique de taille :
- **app.js** : ~61% de réduction (225KB → 88KB)
- **app-d3.js** : ~54% de réduction (63KB → 29KB)
- **Total** : ~60% de réduction de taille

## 🔧 Personnalisation

Pour modifier la configuration de minification, éditez `build.js` :

```javascript
const config = {
    terserOptions: {
        compress: {
            drop_console: false,  // Garder console.log
            pure_funcs: ['debugLog']  // Supprimer debugLog
        }
    }
};
```

## 🔍 Debugging

En cas de problème avec les fichiers minifiés :

1. **Vérifiez build-info.json** pour les statistiques
2. **Comparez avec les originaux** pour identifier les différences
3. **Ajoutez des fonctions à preserve** dans `build.js` si nécessaire
4. **Utilisez les fichiers originaux** pour le debugging détaillé

## 📝 Notes

- Les fichiers minifiés sont **inclus dans git** par défaut
- Pour les exclure, décommentez les lignes dans `.gitignore`
- Le build préserve la fonctionnalité complète de l'application
- Les source maps ne sont pas générées (à ajouter si nécessaire)