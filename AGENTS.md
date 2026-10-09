<!-- PILOT Core Library Agent Governance -->
# PILOT Core Library — Référentiel Obligatoire pour Agents IA

> **OBLIGATION ABSOLUE :**
> Lire [CLAUDE.md](./CLAUDE.md) et [../pilot-docs/rules.md](../pilot-docs/rules.md) avant toute intervention.
> `pilot-core-library` (`@shared/core`) est le **sanctuaire des règles métier pures** et des calculateurs de l'écosystème PILOT.

---

## Règles d'Architecture & NO-GO (Violations = Rejet Automatique)

1. **Zéro Dépendance Externe** : Aucun import de framework (React, Vue), de persistance (Dexie, Drizzle, SQL) ou de runtime web (DOM, `window`, `document`, `fetch`). Le code doit tourner à l'identique dans Node.js, le navigateur et un worker mobile.
2. **Fonctions Pures & Déterministes** :
   - Toute fonction métier doit être pure : pour des entrées identiques, elle retourne toujours la même sortie, sans effet de bord ni état mutable global.
   - Les dates sont traitées en UTC ou fuseau horaire explicite (`Europe/Paris`) sans dépendre de l'horloge locale de la machine.
3. **Traçabilité Juridique & Conventionnelle (IDCC 1351)** :
   - Chaque fonction de calcul ou majoration doit obligatoirement citer dans sa JSDoc l'article de la convention collective ou du Code du Travail (ex: *Accord IDCC 1351 du 18 mai 1993*, *Art. L3131-1 sur le repos de 11h*, *Majorations dimanche/férié/nuit 21h-06h*).
4. **Couverture de Tests 100 % Obligatoire** :
   - Tout nouveau calculateur, moteur de segmentation horaire ou règle d'équité de planning doit avoir sa suite de tests unitaires exhaustive avec tests aux limites (edge cases : minuit, week-ends, 1er mai, années bissextiles, passage heure d'été/hiver).
5. **Langue des Commentaires** : 100 % des commentaires et de la documentation JSDoc rédigés en français.

---

## Commandes de Vérification
```bash
npm test             # 100 % des tests unitaires passants obligatoires
```
