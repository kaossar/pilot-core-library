# PILOT Core Library — Référentiel Claude Code

> Bibliothèque partagée `@shared/core` — Contrats TypeScript + constantes métier.
> Importée par pilot-mobile, pilot-backend, pilot-frontend. Toute modification impacte les 3.

## 1. Commandes

```bash
npm test                 # Tests des calculateurs (missionCalculator, prePlanner...)
```

> **Règle absolue :** Tout ajout ou modification d'export DOIT être rétrocompatible.
> Un export supprimé ou renommé casse les 3 repos qui en dépendent.

---

## 2. Architecture

```
pilot-core-library/src/
├── index.js             ← Point d'entrée principal — exports publics
├── rbac/                ← ROLES, ACTIONS, permissions par rôle
├── constants/           ← IDCC_PLANNING_RULES, IDCC_1351_DATA, VIOLATIONS...
├── calculators/         ← Calculateurs planning, missions, récurrence
├── validators/          ← Validateurs purs (dates, CNAPS, formats)
├── industries/          ← AVAILABLE_INDUSTRIES, codes secteur
└── utils/               ← Utilitaires partagés
```

**Exports clés :**
- `ROLES` — rôles utilisateur (AGENT, SUPERVISOR, MANAGER, ADMIN...)
- `ACTIONS` — permissions par ressource
- `IDCC_PLANNING_RULES` — règles IDCC 1351 (repos 11h, 48h/sem...)
- `AVAILABLE_INDUSTRIES` — secteurs d'activité
- `VIOLATIONS` — codes de violation métier

---

## 3. Règles impératives (bloquantes)

| Règle | Description |
|---|---|
| Zéro dépendance framework | Aucun React, Express, Dexie — JavaScript/TypeScript pur |
| Rétrocompatibilité | Jamais supprimer ni renommer un export sans migration coordonnée |
| Source unique de vérité | Les rôles et constantes définis ici ne sont JAMAIS réécrits ailleurs |
| Tests obligatoires | Tout nouveau calculateur a ses tests avant merge |
| Commentaires français | 100 % des commentaires en français |

---

## 4. Règle d'or

> Si une règle métier ou une constante est définie ici,
> elle ne doit JAMAIS être redéfinie dans pilot-mobile, pilot-backend ou pilot-frontend.
> Toujours importer depuis `@shared/core`.

---

## 5. Références

- Gouvernance complète : [`../CLAUDE.md`](../CLAUDE.md)
