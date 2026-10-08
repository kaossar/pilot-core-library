---
name: new-constant
description: Ajouter une nouvelle constante, rôle ou règle métier dans pilot-core-library. Fournir le nom et la catégorie en argument. Exemple : /new-constant SHIFT_MAX_DURATION constants
disable-model-invocation: true
---

# Ajout d'une Constante dans PILOT Core Library

Ajouter `$ARGUMENTS` dans pilot-core-library.

## Étapes

1. **Identifier la catégorie** (`rbac/`, `constants/`, `calculators/`, `validators/`, `industries/`, `utils/`)
2. **Vérifier** que la constante n'existe pas déjà : `grep -rn "NOM_CONSTANTE" src/`
3. **Créer ou modifier** le fichier source correspondant
4. **Exporter** depuis le fichier `index.js` du module concerné
5. **Vérifier l'export racine** dans `src/index.js` — ajouter si nécessaire
6. **Écrire un test** si la constante est un calculateur ou validateur
7. **Vérifier** : `npm test`
8. **Documenter** en commentaire JSDoc français ce que représente la constante et son usage

## Règle impérative

> Cette constante sera importée par pilot-mobile, pilot-backend ET pilot-frontend.
> Son nom et sa valeur sont **définitifs** dès la première publication.
> En cas de doute sur le nom, demander avant de créer.
