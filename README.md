# CTFd Challenge Map

Interface de visualisation interactive pour CTFd qui affiche la progression des équipes sur une carte des challenges.

**Développé par :** Tungst - Oscar Zulu OSINT Crew

## Installation rapide

### Option 1: Extension navigateur (Le plus simple)
1. Installer l'extension "Allow CORS" ou "CORS Unblock"
2. Ouvrir `index.html` directement dans le navigateur
3. Activer l'extension uniquement pendant l'utilisation

### Option 2a: Proxy Go (Recommandé - plus léger)
```bash
# Compiler le proxy
go build -o ctfd-proxy proxy.go

# Lancer avec l'instance par défaut (demo.ctfd.io)
./ctfd-proxy

# Ou avec une instance spécifique
CTFD_URL=https://votre-ctfd.com ./ctfd-proxy

# Ou avec des options
./ctfd-proxy -ctfd-url=https://votre-ctfd.com -port=8080

# Accéder à l'interface
http://localhost:3000
```

### Option 2b: Proxy Node.js (Alternative)
```bash
# Installer les dépendances
npm install

# Lancer le proxy
CTFD_URL=https://votre-ctfd.com npm start

# Accéder à l'interface
http://localhost:3000
```

### Option 3: Serveur Python simple
```bash
# Python 3
python -m http.server 8000

# Puis utiliser une extension CORS
```

## Configuration

### Obtenir un token API CTFd
1. Connectez-vous à votre instance CTFd
2. Allez dans Settings → Access Tokens
3. Créez un nouveau token
4. Copiez le token (format: `ctf_xxxxxxxxxxxx`)

### Types de tokens
- **Token utilisateur**: Vue limitée à votre équipe
- **Token admin**: Vue complète de toutes les équipes

## Utilisation

### Connexion
1. Ouvrez l'interface dans votre navigateur
2. Entrez l'URL de votre instance CTFd
3. Collez votre token API
4. Cliquez "Se connecter"

### Navigation dans l'interface
- **Sélection d'équipes**: Cochez/décochez les équipes dans la sidebar gauche
- **Contrôles de vue**: Utilisez les boutons en haut à droite (Vue générale, Parcours, Heatmap)
- **Filtrage de challenges**: Bouton "🔍 Filtres" pour filtrer les challenges affichés
- **Navigation**: Zoom avec la molette, déplacement par glisser-déposer
- **Challenges**: Cliquez pour voir les détails, glissez pour repositionner
- **Informations**: Bouton "À propos" pour les crédits et fonctionnalités

### Utilisation des modes

#### Mode Parcours 🛤️
1. Sélectionnez une ou plusieurs équipes
2. Cliquez sur "Parcours" dans les contrôles
3. Observez les lignes colorées montrant la progression chronologique
4. Glissez les challenges : les lignes suivent en temps réel

#### Mode Heatmap 🔥
1. Sélectionnez les équipes à analyser
2. Cliquez sur "Heatmap" dans les contrôles
3. Observez les couleurs des challenges :
   - **Bleu** : Résolus rapidement
   - **Rouge** : Ont pris beaucoup de temps
   - **Gris** : Non résolus par les équipes sélectionnées
4. Survolez pour voir les temps détaillés

#### Mode Filtrage 🔍
1. Cliquez sur "🔍 Filtres" dans les contrôles
2. Utilisez les filtres disponibles :
   - **🔎 Recherche** : Filtrez par nom de challenge
   - **📂 Catégories** : Sélectionnez les catégories à afficher
   - **⭐ Difficulté** : Définissez une plage de points
   - **🎯 Statut** : Choisissez les statuts (résolu, tenté, disponible, verrouillé)
3. Cliquez "Appliquer" pour filtrer les challenges
4. Les challenges non sélectionnés apparaissent en transparence
5. Utilisez "Reset" pour effacer tous les filtres

## Fonctionnalités

### Interface principale
- 🗺️ **Carte interactive** des challenges avec dépendances visuelles
- 🎯 **États des challenges**: résolu, tenté, disponible, verrouillé
- 👥 **Vue multi-équipes** pour les administrateurs
- 📈 **Statistiques en temps réel** et informations détaillées
- 🎨 **Interface moderne** et responsive avec D3.js
- 🔍 **Système de filtrage avancé** pour se concentrer sur des challenges spécifiques

### Modes de visualisation
- 📊 **Vue générale**: Affichage standard avec statuts des challenges
- 🛤️ **Mode Parcours**: Visualisation chronologique du chemin des équipes
- 🔥 **Heatmap**: Analyse des temps de résolution pour identifier les challenges bloquants
- 🔍 **Mode Filtrage**: Système avancé pour masquer/afficher des challenges spécifiques

### Fonctionnalités avancées
- 🎨 **Couleurs distinctes** pour les équipes (jusqu'à 16 couleurs prédéfinies)
- 📊 **Données temps réel**: Tentatives, échecs, et temps de résolution
- 🔍 **Tooltips détaillés** avec statistiques par challenge
- 📱 **Navigation fluide**: Zoom, pan, fit-to-screen
- 💾 **Positions sauvegardées**: Drag & drop des challenges avec mémorisation
- ℹ️ **Interface complète**: Bouton "À propos" avec crédits et informations

### Mode Parcours
- 🎯 **Lignes animées** montrant la progression chronologique des équipes
- ⚡ **Mise à jour temps réel** pendant le déplacement des challenges
- 🎨 **Couleurs d'équipes distinctes** avec flèches directionnelles
- 📅 **Tri chronologique** basé sur les dates réelles de résolution

### Mode Heatmap
- 🌡️ **Échelle de couleurs** du bleu (rapide) au rouge (lent)
- ⏱️ **Temps moyens** de résolution entre challenges
- 📊 **Analyse de difficulté** relative pour optimiser les CTFs
- 🔒 **Challenges gris** pour les non-résolus (aucune donnée)

### Système de filtrage
- 🔎 **Recherche textuelle** dans les noms de challenges
- 📂 **Filtrage par catégories** avec sélection multiple
- ⭐ **Plage de difficulté** en points personnalisable
- 🎯 **Filtrage par statut** (résolu, tenté, disponible, verrouillé)
- 👁️ **Affichage en transparence** des challenges filtrés
- ♻️ **Reset rapide** pour effacer tous les filtres
- 🏷️ **Affichage des filtres actifs** avec indicateurs visuels

## Cas d'usage

### Pour les organisateurs de CTF
- **📊 Analyse post-événement**: Utilisez la heatmap pour identifier les challenges trop difficiles
- **🛤️ Suivi des équipes**: Mode Parcours pour voir les stratégies de résolution
- **⚖️ Équilibrage**: Ajustez la difficulté en analysant les temps de résolution
- **📈 Métriques**: Statistiques détaillées par équipe et par challenge
- **🔍 Filtrage ciblé**: Analysez des catégories ou difficultés spécifiques
- **🎯 Focus sur problèmes**: Filtrez les challenges non résolus pour identifier les blocages

### Pour les participants
- **🎯 Stratégie d'équipe**: Visualisez votre progression vs autres équipes
- **📊 Performance**: Analysez vos temps de résolution
- **🗺️ Navigation**: Vue claire des dépendances entre challenges
- **📈 Suivi temps réel**: Progression live pendant la compétition
- **🔍 Focus catégories**: Filtrez par vos spécialités (Web, Crypto, etc.)
- **⭐ Gestion difficulté**: Masquez les challenges trop difficiles ou trop faciles

### Pour les éducateurs
- **👨‍🏫 Pédagogie**: Montrez visuellement la progression d'apprentissage
- **🎓 Évaluation**: Identifiez les concepts les plus difficiles
- **📚 Retour d'expérience**: Débriefing visuel après les exercices

## Dépannage

### Erreur CORS
- Utilisez le proxy Node.js (Option 2)
- Ou installez une extension navigateur
- Ou configurez les headers CORS sur votre serveur CTFd

### Token invalide
- Vérifiez que le token est correct et non expiré
- Assurez-vous d'avoir les bonnes permissions

### URL incorrecte
- Vérifiez l'URL CTFd (avec https://)
- Testez l'accès direct à l'API: `https://votre-ctfd.com/api/v1/challenges`

## Mode démo

Deux modes de démonstration sont disponibles:
- **Démo Équipe**: Vue limitée d'une équipe
- **Démo Admin**: Vue complète avec toutes les équipes

## Développement

Structure du projet:
```
ctfdMap/
├── index.html             # Interface principale avec modal "À propos"
├── app.js                 # Code JavaScript de l'application
├── app-d3.js              # Module de visualisation D3.js
├── proxy.go               # Serveur proxy Go (recommandé)
├── proxy-server.js        # Serveur proxy Node.js (alternative)
├── LICENSE                # Licence MIT
├── Makefile               # Scripts de compilation Go
├── package.json           # Dépendances Node.js
└── README.md              # Documentation complète
```

## Crédits

**Auteur :** Tungst - Oscar Zulu OSINT Crew

**Special Thanks :**
- Degun
- Rofellos  
- Grand Duc

## Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

### Licence MIT
```
Copyright (c) 2025 Oscar Zulu OSINT Crew

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```