# Audit web et fiabilité — Agora, 26 octobre 2026

L'instance déployée tourne en **v0.44.1**, commit `6f26618823b3a38c5d97301e1d19ab63f65c4ce2`. L'audit a comparé le serveur avec le worktree `figma-interface-redesign-be0483` : les empreintes des fichiers de gestion des messages, OAuth, backups et du script d'exploitation étaient identiques avant correction. Le dossier initial du chat est resté sur son ancienne branche v0.4.0.

Les correctifs décrits ici sont **locaux, non déployés et non commités** dans le worktree v0.44.1. La refonte existante est préservée. Le patch adjacent `2026-10-26-web-fixes.patch` contient uniquement les changements de cet audit et leurs tests, sans la refonte.

## Résultats prioritaires

| Priorité | Problème | Preuve | État |
| --- | --- | --- | --- |
| P1 | La sauvegarde hors site sature le disque pendant la copie Hermes | Journal systemd de cette nuit : `No space left on device`, puis arrêt avant l'envoi des fichiers | Garde-fou ajouté avant la pause ; capacité restante à résoudre |
| P1 | La rétention hors site n'est jamais appelée si la copie des fichiers échoue | `forget --prune` était après le point d'échec, alors qu'un snapshot DB avait déjà été créé | Corrigé : rétention aussi sur l'échec, après nettoyage du staging, avec conservation du code d'erreur |
| P1 | Des réponses REST anciennes peuvent effacer un message reçu ou ressusciter un message supprimé | Reproductions sur les fonctions réelles, puis tests avec React Query et requête en attente | Corrigé côté web |
| P1 | Un flux OAuth d'un autre connecteur peut finaliser le mauvais connecteur ; deux polls peuvent finaliser deux fois | Deux reproductions isolées, avec dépendances simulées | Corrigé : identité Hermes vérifiée, opérations sérialisées et droits de connexion vérifiés |
| P2 | Les backups interrompus restent sur disque et sont présentés comme utilisables | Échec d'archive simulé : dossier contenant seulement `db.sql`, pourtant listé | Corrigé : publication atomique, nettoyage des échecs, rétention indépendante des mises à jour réussies |
| P2 | L'ordre des messages n'a pas de règle complète en cas de dates identiques | Deux ordres d'arrivée produisaient deux ordres différents ; précision SQL perdue à la sérialisation | Corrigé : microsecondes conservées et départage par identifiant identique entre SQL et client |
| P2 | La bascule entre réponses en cours et messages enregistrés peut déplacer les réponses parallèles | Les deux catégories sont rendues dans deux listes distinctes | Reste à vérifier dans le navigateur et à traiter avec une chronologie commune |
| P2 | Le JavaScript initial est volumineux | Mesure du fichier réellement servi : 2 125 660 octets, 674 632 octets gzip | Mesuré ; découpage des écrans à faire |

## Ce qui se passe sur le serveur

Observation à 21h44, heure de Paris : le disque est à **81 %**, avec environ **19 Go disponibles**. PostgreSQL est healthy, l'API répond et le serveur ne présente pas de saturation CPU permanente à cet instant. Ce constat ponctuel ne décrit pas ses pics de charge.

Les backups locaux occupent **10,7 Go**, répartis entre deux sauvegardes, du 13 et du 20 octobre. La configuration garde les sept dernières sauvegardes : conserver ces deux dossiers est donc normal. Les correctifs ne les suppriment pas arbitrairement.

Le dernier job hors site a commencé le 26 octobre à 02h30m30 et s'est terminé en erreur à 02h35m48. Le dump PostgreSQL a été envoyé ; la copie locale des données Hermes a échoué faute d'espace. Le script met Hermes en pause pendant cette copie : cela fournit un mécanisme plausible de gel des bots à cette heure, sans prouver l'origine de chaque ralentissement signalé. La rétention restic située après cette copie était également sautée.

Le garde-fou estime les fichiers avec les mêmes exclusions de caches que la copie, vérifie l'espace du volume de destination et prévoit une marge de 10 % plus 64 MiB. L'estimation expire après 120 secondes et se fait pendant que Hermes fonctionne. Un espace insuffisant arrête le job avant la pause. Cela protège le serveur, mais ne fournit pas l'espace nécessaire à une sauvegarde complète : il reste à revoir le volume à copier ou la capacité disponible, puis réussir une sauvegarde et vérifier sa restauration.

## Messages et cache : changements livrés dans le code

Fichiers : `apps/api/src/messages.ts`, `packages/core/src/messages.ts`, `apps/web/src/lib/queries.ts`, `apps/web/src/lib/realtime.ts`.

- REST et SSE transportent la même date UTC avec les microsecondes de PostgreSQL. SQL et client utilisent l'identifiant comme départage des dates identiques. Les anciennes dates à trois décimales restent comparables aux nouvelles dates à six décimales.
- Le chargement capture le cache avant sa requête. À la réception, il distingue les messages ajoutés pendant la requête de ceux supprimés entre-temps, et conserve les réponses du serveur comme référence pour les messages plus anciens.
- Un événement de suppression annule la requête en cours sans revenir à un cache ancien, retire le message puis recharge l'état validé par le serveur. Le signal d'annulation est transmis au vrai `fetch`.

La base de production ne contient pas de collision à la milliseconde dans une même conversation au moment du contrôle. Les cas d'égalité sont des bugs reproduits, **pas une explication démontrée des déplacements déjà observés par Théo**. Le rendu des réponses parallèles reste un candidat distinct : `Conversation.tsx` affiche d'abord les messages enregistrés, puis les réponses en cours. Une réponse courte terminée peut donc remonter devant une réponse longue encore active. Aucun changement de cette composition visuelle n'a été mêlé à la refonte en cours.

## Intégrations

Fichiers corrigés : `apps/api/src/mcp-oauth-flows.ts`, `apps/api/src/mcp-requests.ts`, `apps/api/src/routes/mcp-requests.ts`.

Le statut OAuth vérifie désormais `server_name`, fourni par le snapshot réel de Hermes. Ce champ a été vérifié dans le code de Hermes installé sur le serveur ; il permet aussi cette vérification après un redémarrage de l'API. Lorsqu'un flux plus récent est connu, un ancien identifiant est refusé. Les démarrages, annulations et finalisations d'un même connecteur sont sérialisés ; le statut en base est relu après l'acquisition du verrou pour éviter plusieurs finalisations et redémarrages du gateway. Un simple membre autorisé à lire une demande ne peut plus en déclencher la finalisation.

La base de production contient huit connecteurs installés et une demande `search-console` en statut `approved` avec l'erreur **`Connection closed`**. Les correctifs OAuth ne constituent pas une résolution de cette erreur. Il reste à capturer le stderr et l'échec de démarrage du serveur MCP concerné, avec masquage des secrets. La demande utilise `npx @ni-c/google-search-console-mcp`, avec `GSC_SERVICE_ACCOUNT_KEY` et `GSC_SITE_URL`. La [documentation du mainteneur](https://github.com/ni-c/google-search-console-mcp/blob/main/README.md) précise notamment le format JSON ou base64 de la clé et exige Node.js 22 ou plus ; ces points sont à vérifier avec les erreurs du processus, sans conclure qu'ils expliquent cet échec. Aucun flux de connexion réel ni renouvellement forcé des identifiants n'a été lancé pendant l'audit.

## Backups locaux

Fichiers : `apps/updater/src/backup.ts`, `apps/updater/src/main.ts`.

Une sauvegarde est écrite dans un dossier `.partial-*`, puis renommée après réussite du dump et de l'archive. Un échec supprime ses fichiers après l'arrêt de l'éventuel conteneur d'archivage restant. La liste publique n'inclut que les dossiers de sauvegarde attendus contenant les deux fichiers non vides. Les tentatives interrompues anciennes sont supprimées après 24 heures ; les tentatives récentes sont laissées tranquilles.

La rétention s'exécute au démarrage et lors du passage périodique de l'updater, même sans mise à jour réussie. Une valeur de rétention invalide ne peut pas supprimer toutes les sauvegardes. Un échec de nettoyage après création ne fait plus perdre l'identifiant d'une sauvegarde valable pour rollback. Le format des deux fichiers restaurables reste identique. La présence des fichiers ne remplace pas une vérification de restauration complète, qui n'a pas été exécutée.

## Performances : mesures et limites

- Le bundle initial de production fait environ **2,13 Mo**, **675 ko gzip**. Le routage charge statiquement de nombreux écrans, et la coque importe les paramètres et leur administration. Le découpage au chargement est une piste étayée par la taille du bundle ; son gain sur le temps d'interaction doit encore être mesuré dans le navigateur.
- La requête représentative de la liste des conversations prend **11,122 ms** d'exécution dans un `EXPLAIN ANALYZE` en transaction de lecture seule. Elle trie et agrège les **1 527 messages** présents lors du contrôle. Elle parcourra davantage d'historique avec la croissance de la base, mais cette mesure ne démontre pas un blocage SQL actuel. Éviter les agrégats sur tout l'historique et récupérer le dernier message par conversation est une optimisation ultérieure.
- Les URLs de prévisualisation d'images sont conservées après certains parcours d'envoi ou de démontage du composer. Leur cycle de vie mérite une correction avec transfert explicite de propriété entre composer et message temporaire. Aucune consommation mémoire ni dégradation de frame n'a été mesurée pour en chiffrer l'impact.
- Pas de trace navigateur pendant un ralentissement réel, de mesure répétée des longues tâches ou de profil de streaming sous charge dans cette session. Aucun gain de vitesse global n'est revendiqué.

## Vérification

- Base v0.44.1 avant correction : **180 tests API réussis** avec une configuration de test isolée. La première tentative sans variables d'environnement était inexploitable et n'a pas été comptée comme un échec produit.
- Après correction : **199 tests API/updater/infrastructure réussis**, plus **3 tests web avec React Query**, soit **202 réussis**, dont **22 nouveaux tests de régression**.
- Typecheck : API, web, updater et core réussis. Build de production web réussi. Syntaxe Bash et vérification des espaces du diff réussies.
- L'estimation d'espace a également été exécutée dans une image Alpine éphémère, sans réseau et sans volume de production : les exclusions et le calcul donnent le résultat attendu sur une petite fixture.
- React Doctor **0.9.18**, schéma JSON **3**, scope **full**, projet `@agora/web`, toutes catégories : couverture complète de **224 fichiers**, score **39 avant et après**, **7 erreurs et 128 avertissements**. Aucune nouvelle alerte dans le rescan complet. Un scan complémentaire `--scope changed --base HEAD --include-untracked` a aussi été exécuté ; son périmètre inclut la refonte existante et son score n'est pas comparable au scope full.
- Plusieurs erreurs de nettoyage remontées par le scanner sont des faux positifs établis par le code : `MemoryGraph` arrête sa simulation et ses callbacks ; `AgentScreen` nettoie son listener et son timer ; le flux SSE ferme sa source et ses timers via ses fonctions de nettoyage. Le score statique ne mesure pas la vitesse de l'app.
- `pnpm audit --prod --json` signale encore **4 vulnérabilités de sévérité haute dans le lockfile du monorepo**. Elles précèdent ces changements ; l'exposition effective varie selon les chemins d'exécution et n'a pas été exploitée. Les avis [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) et [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828) ont été vérifiés. Le signal Socket sur Better Auth n'est pas corroboré par cet audit npm et n'est pas présenté comme une faille confirmée de l'application.

Commandes de régression, depuis le worktree v0.44.1 :

```sh
# Les tests API exigent DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL et WEB_ORIGIN de test.
bun test apps/api/src apps/updater/src infra/backup-space.test.ts
cd apps/web
bun test tests/message-cache.test.ts
```

## Suite recommandée

1. Revoir le patch isolé et publier les correctifs sur une branche issue de v0.44.1, indépendamment de la refonte.
2. Résoudre la capacité de staging, réussir une sauvegarde hors site complète et vérifier sa restauration avant tout nettoyage de sauvegardes utiles.
3. Isoler l'échec de `search-console` avec les erreurs de son processus MCP.
4. Reproduire dans le navigateur les réponses parallèles et adopter une position commune aux réponses en cours et finalisées.
5. Découper les écrans au chargement, puis profiler une conversation longue pendant le streaming. Ajouter les tests de régression à la CI et traiter les avis de dépendances existants.
