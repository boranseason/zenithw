<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.tr.md">Türkçe</a> •
  <a href="./README.fr.md">Français</a> •
  <a href="./README.ja.md">日本語</a> •
  <a href="./README.de.md">Deutsch</a>
</p>

---

# ZenithW

**Téléchargeur de médias gratuit, sans publicité et sans filigrane.** Téléchargez des vidéos et de l'audio depuis YouTube, TikTok, Instagram, X/Twitter, Reddit et bien plus en un seul clic.

🔗 **En ligne:** [zenithw.space](https://zenithw.space)

🏷️ **Version actuelle:** `v14.0` — une page d'accueil plus chaleureuse, des pages d'outils dédiées, une navigation responsive partagée et une expérience globale améliorée.

---

## Table des matières

- [Fonctionnalités](#fonctionnalités)
- [Technologies utilisées](#technologies-utilisées)
- [Structure du projet](#structure-du-projet)
- [Démarrage rapide](#démarrage-rapide)
- [Variables d'environnement](#variables-denvironnement)
- [Référence API](#référence-api)
- [Modèle de déploiement](#modèle-de-déploiement)
- [Sécurité](#sécurité)
- [Historique des versions](#historique-des-versions)
- [Mentions légales](#mentions-légales)
- [Licence](#licence)
- [Contact](#contact)

---

## Fonctionnalités

- 🎬 **Prise en charge multiplateforme** — YouTube, TikTok, Instagram, X/Twitter, Reddit et de nombreuses autres sources (propulsé par yt-dlp)
- 🎵 **Vidéo ou Audio** — formats vidéo tels que mp4/webm/mkv, formats audio tels que mp3/flac/wav/ogg/opus/m4a
- 🔇 **Mode Muet** — téléchargez des vidéos sans piste audio
- 📃 **Téléchargements par lots / Playlists** — traitez jusqu'à 10 liens collés ou inspectez des playlists contenant jusqu'à 50 éléments
- ⏭️ **Intégration SponsorBlock** — masquez ou supprimez automatiquement les segments sponsorisés, intros, outros, etc.
- 🖼️ **Téléchargement de miniatures** — récupérez l'image de couverture avec le média ou séparément
- 📝 **Prise en charge des sous-titres et métadonnées** — téléchargez les sous-titres disponibles et intégrez les métadonnées vidéo
- 🔄 **Convertisseur** — remuxe d'abord les flux compatibles et ne réencode que lorsque le format de sortie l'exige
- 🎞️ **Vrai Remux** — changez de conteneur compatible avec la copie de flux FFmpeg sans réencoder
- 🌍 **4 langues supportées** — Turc, Anglais, Français, Allemand
- 🎨 **Interface personnalisable** — thèmes clair/sombre, couleurs d'accentuation, animations fluides
- 🔒 **Aucun historique sur le serveur** — l'historique de téléchargement est stocké uniquement en local sur l'appareil (localStorage)
- ⚡ **Progression en temps réel** — état du téléchargement en direct via Socket.IO
- 🚀 **Transfert natif vers le navigateur** — le média final est accessible via une URL de téléchargement temporaire à usage unique

> **Remarque:** l'accélération multi-connexion via aria2 est actuellement désactivée pour des raisons de sécurité (protection SSRF).

---

## Technologies utilisées

| Couche | Technologie |
|---|---|
| Backend | Python, Flask, Flask-SocketIO (gevent) |
| Moteur de téléchargement | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Traitement média | FFmpeg |
| Frontend | Vanilla HTML/CSS/JS (sans framework) |
| Hébergement Frontend | [Cloudflare Pages](https://pages.cloudflare.com) |
| Hébergement Backend | [Railway](https://railway.app) |

---

## Démarrage rapide

### Prérequis

- Python 3.10+
- FFmpeg installé et accessible dans votre `PATH`

### Installation

```bash
git clone https://github.com/kakangeldi82-netizen/zenithw.git
cd zenithw/backend

python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### Exécution en local

```bash
python app.py
```

Le serveur démarre sur `http://localhost:5000` par défaut.

---

## Référence API

| Endpoint | Méthode | Description |
|---|---|---|
| `/info` | POST | Renvoie les métadonnées de la vidéo/playlist |
| `/download` | POST | Exécute une tâche de téléchargement et renvoie une URL temporaire |
| `/files/<token>` | GET / HEAD | Transfère un fichier préparé via un jeton unique lié à l'IP |
| `/thumbnail` | POST | Télécharge l'image de couverture pour une URL donnée |
| `/convert` | POST | Convertit ou remuxe un fichier envoyé |
| `/cancel` | POST | Annule un téléchargement en cours |
| `/health` | GET | Vérification de l'état du serveur |

---

## Licence

[MIT](./LICENSE)

---

## Contact

- Développeur: [@boranseason](https://www.instagram.com/boranseason)
- Email: [info@zenithw.space](mailto:info@zenithw.space)
