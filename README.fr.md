# ZenithW

> Un espace multimédia sobre et sans publicité pour télécharger, convertir et remuxer les contenus que vous êtes autorisé à utiliser.

[Application](https://zenithw.space) · [Statut](https://zenithw.space/status) · [Mises à jour](https://zenithw.space/updates) · [English](README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md)

Version actuelle : **v14.2**

## Fonctionnalités

- Sources YouTube, TikTok, Instagram, X, Reddit et autres services compatibles avec yt-dlp.
- Vidéo, audio, vidéo muette, listes de lecture et petits lots de liens.
- Conversion FFmpeg et remux sans réencodage lorsque les flux sont compatibles.
- Sous-titres, métadonnées, miniatures, SponsorBlock, annulation et progression en direct.
- Historique conservé dans le navigateur, sans compte utilisateur côté serveur.

## Architecture

| Couche | Technologie |
|---|---|
| Frontend | HTML, CSS et JavaScript sur Cloudflare Pages |
| Backend | Flask, Gunicorn, gevent et Socket.IO sur AWS EC2 |
| Média | yt-dlp, FFmpeg et Deno/EJS |
| Réseau | Cloudflare, Nginx, TLS strict et vérification de l'origine |

Le backend utilise volontairement **un seul worker**. Plusieurs workers exigent d'abord un état partagé, un routage Socket.IO et un stockage commun.

## Développement local

```bash
git clone https://github.com/boranseason/zenithw.git
cd zenithw/backend
python -m venv .venv
pip install --require-hashes -r requirements.lock
python app.py
```

Python 3.10+ et FFmpeg sont requis. Gardez les secrets hors de Git et n'assouplissez CORS que pour le développement local.

## Sécurité et usage

ZenithW bloque les destinations réseau privées, limite les tâches et le stockage temporaire, puis remet les fichiers via des jetons de courte durée. Utilisez le service uniquement pour des contenus que vous possédez ou êtes autorisé à télécharger. ZenithW n'est affilié à aucune plateforme prise en charge.

Signalez les problèmes reproductibles sur [GitHub Issues](https://github.com/boranseason/zenithw/issues), sans données privées ni secrets.

## Licence

- ZenithW : AGPL-3.0-only
- Dépendances tierces : leurs licences respectives
- Détails : [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
