# SODIPAS Backend API

<div align="center">

![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![Node](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Express](https://img.shields.io/badge/Express-4.21.0-yellow)
![License](https://img.shields.io/badge/License-ISC-lightgrey)

**Backend API pour l'application SODIPAS - Gestion de Distribution de Fruits**

[Démarrage Rapide](#-démarrage-rapide) •
[Architecture](#-architecture) •
[API Reference](#-api-reference) •
[Authentification](#-authentification) •
[Contribution](#-contribution)

</div>

---

## 📋 À propos

SODIPAS Backend est une API RESTful conçue pour gérer les opérations logistiques et commerciales d'une entreprise de distribution de fruits au Sénégal. Elle fournit des endpoints pour l'authentification, la gestion des clients, des camiones et des stocks.

### Fonctionnalités principales

- 🔐 **Authentification sécurisée** avec vérification OTP à deux facteurs
- 👥 **Gestion des utilisateurs** avec rôles (admin, manager, warehouse, viewer)
- 🏪 **Gestion des clients** (CRUD complet, suivi des créances)
- 🚛 **Suivi des camions** (arrivées, déchargements, état des livraisons)
- 📦 **Gestion des stocks** (produits, hangars, seuils d'alerte)
- 📊 **Tableaux de bord analytiques** (revenus, distribution, performance)

---

## 🚀 Démarrage Rapide

### Prérequis

- Node.js version 18 ou supérieure
- npm ou yarn

### Installation

```bash
# Cloner le projet
git clone <repository-url>
cd sodipas-project/sodipas-back

# Installer les dépendances
npm install
```

### Démarrage du serveur

```bash
# Mode production
npm start

# Mode développement (avec hot reload)
npm run dev
```

Le serveur sera accessible à l'adresse : **`http://localhost:3002`**

---

## 🏗️ Architecture

```
sodipas-back/
├── server.js           # Point d'entrée principal de l'API
├── db.json             # Base de données JSON (données persistantes)
├── package.json        # Configuration npm et dépendances
└── README.md           # Documentation
```

### Stack technique

| Composant | Technologie |
|-----------|-------------|
| Serveur | Express.js 4.21.0 |
| CORS | cors 2.8.5 |
| Runtime | Node.js |
| Type | ES Modules |

---

## 🔐 Authentification

L'API utilise un système d'authentification à deux facteurs avec OTP.

### Flux d'authentification

```
1. POST /auth/login         → Vérification email → Envoi OTP
2. POST /auth/verify-otp    → Vérification OTP → Réception token
3. GET  /auth/me            → Validation token → Données utilisateur
```

### Étape 1 : Connexion avec email

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@sodipas.sn"
}
```

**Réponse :**

```json
{
  "success": true,
  "requiresOtp": true,
  "user": {
    "id": 1,
    "email": "admin@sodipas.sn",
    "role": "admin"
  },
  "_debug_otp": "123456"
}
```

> ⚠️ **Note** : Le code OTP est affiché dans la console du serveur en mode développement.

### Étape 2 : Vérification OTP

```http
POST /auth/verify-otp
Content-Type: application/json

{
  "email": "admin@sodipas.sn",
  "otp": "123456"
}
```

**Réponse :**

```json
{
  "success": true,
  "token": "abc123def456...",
  "user": {
    "id": 1,
    "email": "admin@sodipas.sn",
    "name": "Administrateur SODIPAS",
    "role": "admin"
  }
}
```

### Autres endpoints d'authentification

```http
# Renvoi du code OTP
POST /auth/resend-otp
{ "email": "admin@sodipas.sn" }

# Déconnexion
POST /auth/logout
Authorization: Bearer <token>

# Obtenir l'utilisateur courant
GET /auth/me
Authorization: Bearer <token>
```

---

## 📚 API Reference

### Utilisateurs

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/users` | Liste tous les utilisateurs |
| GET | `/users/:id` | Obtenir un utilisateur par ID |
| POST | `/users` | Créer un utilisateur |
| PUT | `/users/:id` | Modifier un utilisateur |
| DELETE | `/users/:id` | Supprimer un utilisateur |

### Clients

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/clients` | Liste tous les clients |
| GET | `/clients/:id` | Obtenir un client par ID |
| POST | `/clients` | Créer un nouveau client |
| PUT | `/clients/:id` | Modifier un client |
| DELETE | `/clients/:id` | Supprimer un client |

**Exemple de données client :**

```json
{
  "id": "1",
  "name": "Supermarché Central",
  "phone": "+221 77 123 45 67",
  "email": "contact@supercentral.sn",
  "address": "Dakar, Sénégal",
  "debt": 250000,
  "totalPurchases": 12500000,
  "status": "good",
  "cageots": 45
}
```

### Camions

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/trucks` | Liste tous les camions |
| GET | `/trucks/:id` | Obtenir un camion par ID |
| POST | `/trucks` | Enregistrer un camion |
| PUT | `/trucks/:id` | Modifier un camion |
| DELETE | `/trucks/:id` | Supprimer un camion |

**Statuts disponibles :** `arrived`, `en_route`, `unloaded`, `pending`

### Stocks

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/stocks` | Liste tous les produits en stock |
| GET | `/stocks/:id` | Obtenir un produit par ID |
| POST | `/stocks` | Ajouter un produit au stock |
| PUT | `/stocks/:id` | Modifier un produit |
| DELETE | `/stocks/:id` | Supprimer un produit |

---

## 👥 Comptes de démonstration

| Email | Rôle | Permissions |
|-------|------|-------------|
| admin@sodipas.sn | Administrateur | Accès complet |
| gestionnaire@sodipas.sn | Gestionnaire | Gestion clients/stocks |
| comptable@sodipas.sn | Comptable | Consultation financière |
| hangar1@sodipas.sn | Responsable Hangar | Gestion stocks |
| demo@sodipas.sn | Viewer | Consultation seule |

**Mot de passe** : Le mot de passe n'est pas requis pour le mode démonstration (authentification par OTP uniquement).

---

## ⚙️ Configuration

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | `3002` |

```bash
# Exemple de configuration
PORT=4000 npm start
```

---

## 🚨 Notes de développement

> **Avertissement** : Ce backend est une version de développement utilisant une base de données JSON.

### Pour la production, il est recommandé de :

- 🔄 Remplacer `db.json` par une base de données relationnelle (PostgreSQL, MySQL)
- 📧 Intégrer un service d'envoi d'emails réel (SendGrid, AWS SES)
- 🔑 Implémenter un système de hashing de tokens sécurisé (JWT avec expiration)
- 🛡️ Ajouter un rate limiting pour prévenir les abus
- ✅ Valider et sanitizer toutes les données entrantes
- 📝 Implémenter des logs structurés (Winston, Pino)
- 🔒 Activer HTTPS/TLS

---

## 📁 Structure des données

### Modèle Client

```typescript
interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  debt: number;
  totalPurchases: number;
  status: 'good' | 'warning' | 'critical';
  cageots: number;
  lastPurchase?: string;
  createdAt: string;
}
```

### Modèle Camion

```typescript
interface Truck {
  id: string;
  origin: string;
  driver: string;
  phone: string;
  articles: string;
  value: number;
  status: 'arrived' | 'en_route' | 'unloaded' | 'pending';
  date: string;
  createdAt?: string;
}
```

### Modèle Stock

```typescript
interface Stock {
  id: string;
  name: string;
  hangar: string;
  quantity: number;
  unit: string;
  threshold: number;
  value: number;
  createdAt?: string;
}
```

---

## 📄 Licence

Ce projet est sous licence ISC.

---

## 👨‍💼 Auteur

Développé pour **SODIPAS** - Société de Distribution de Produits Agricoles du Sénégal

---

<div align="center">

**SODIPAS** © 2026 - Tous droits réservés

</div>
