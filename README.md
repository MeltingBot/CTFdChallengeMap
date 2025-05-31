# CTFd Challenge Map

Interface de visualisation interactive pour CTFd qui affiche la progression des équipes sur une carte des challenges.

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

1. Ouvrez l'interface dans votre navigateur
2. Entrez l'URL de votre instance CTFd
3. Collez votre token API
4. Cliquez "Se connecter"

## Fonctionnalités

- 🗺️ Carte interactive des challenges avec dépendances
- 📊 Visualisation de la progression par équipe
- 🎯 États des challenges: résolu, tenté, disponible, verrouillé
- 👥 Vue multi-équipes pour les admins
- 📈 Statistiques en temps réel
- 🎨 Interface moderne et responsive

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
├── index.html             # Interface principale
├── app.js                 # Code JavaScript de l'application
├── app-d3.js              # Module de visualisation D3.js
├── proxy.go               # Serveur proxy Go (recommandé)
├── proxy-server.js        # Serveur proxy Node.js (alternative)
├── Makefile               # Scripts de compilation Go
├── package.json           # Dépendances Node.js
└── README.md              # Documentation
```

## Licence

MIT