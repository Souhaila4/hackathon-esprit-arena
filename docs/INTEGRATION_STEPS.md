## 🔧 GUIDE D'INTÉGRATION - SOFT SKILLS AU COMPANY DASHBOARD

### 📁 Fichiers Créés

```
app/
├── components/
│   └── company/
│       ├── SoftSkillsAnalyzer.tsx      ← Upload vidéo & analyse
│       ├── CandidatesResults.tsx       ← Affichage résultats
│       └── CompanySoftSkillsTab.tsx    ← Composant d'intégration
```

### 🚀 Étape 1: Importer dans Company Dashboard

Ajouter au fichier `app/company-dashboard/page.tsx`:

```tsx
import CompanySoftSkillsTab from "../components/company/CompanySoftSkillsTab";

// Ajouter "SOFT_SKILLS" au type View
type View = "OVERVIEW" | "MY_HACKATHONS" | "CREATE" | "RECRUITMENT" | "SOFT_SKILLS";
```

### 🚀 Étape 2: Ajouter le Bouton de Navigation

Localiser la section "Tabs/Navigation" et ajouter:

```tsx
<button
  onClick={() => setActiveView("SOFT_SKILLS")}
  className={`px-4 py-2 rounded-lg font-medium transition-all ${
    activeView === "SOFT_SKILLS"
      ? "bg-purple-600 text-white"
      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
  }`}
>
  🧠 Soft Skills
</button>
```

### 🚀 Étape 3: Ajouter le Rendu Conditionnel

Localiser le rendu conditionnel par `activeView` et ajouter:

```tsx
{activeView === "SOFT_SKILLS" && (
  <CompanySoftSkillsTab companyId={user?.id} />
)}
```

### ✅ Résultat Complet

Le company dashboard aura une nouvelle onglet avec:

```
Company Dashboard
├── OVERVIEW
├── MY HACKATHONS  
├── CREATE
├── RECRUITMENT
└── 🧠 SOFT SKILLS ← Nouveau!
    ├── SoftSkillsAnalyzer (Upload vidéo)
    ├── Stats panel (à droite)
    └── CandidatesResults (Résultats historiques)
```

---

## 🔌 Configuration de l'API Python

### Démarrer le serveur API:

```bash
# Terminal 1: Soft Skills API (Python)
cd Soft-Skills-Evaluation-System-main
python -m uvicorn api_emotion:app --reload --host 0.0.0.0 --port 5000
```

### Vérifier que l'API répond:

```bash
curl http://localhost:5000/health
# Ou visiter: http://localhost:5000/docs
```

---

## 🧪 Test Rapide

### 1. Uploader une vidéo test
- Aller au Company Dashboard → Soft Skills
- Déposer une vidéo (45sec-5min)
- Cliquer "Analyser la vidéo"

### 2. Voir les résultats
- Les 6 soft skills s'affichent avec scores
- Historique mis à jour automatiquement

---

## 📊 Données d'Exemple

L'API retourne:

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Sarah Dupont",
  "frames_analyzed": 120,
  "dominant_emotion": "happy",
  "emotion_breakdown": {
    "happy": 0.45,
    "neutral": 0.30,
    "surprise": 0.15,
    "sad": 0.05,
    "angry": 0.03,
    "fear": 0.02,
    "disgust": 0.00
  },
  "soft_skills": {
    "communication": 0.9,
    "empathy": 0.8,
    "confidence": 0.85,
    "leadership": 0.75,
    "adaptability": 0.8,
    "stress_management": 0.82
  },
  "overall_score": 8.2,
  "duration_seconds": 45
}
```

---

## 🐛 Troubleshooting

| Problème | Solution |
|----------|----------|
| "API not reachable" | Vérifier que le serveur Python tourne sur le port 5000 |
| "Video not supported" | Utiliser MP4, MOV, AVI, MKV ou WEBM |
| "File too large" | Max 500MB |
| "No faces detected" | Bonne lumière, caméra directe |
| "GPU not available" | Sera utilisé en CPU (plus lent mais ok) |

---

## 📈 Prochaines Étapes

- [ ] Intégrer le NestJS Backend API
- [ ] Sauvegarder les analyses en base de données
- [ ] Notifications en temps réel
- [ ] Comparaison de candidats
- [ ] Export PDF des rapports
- [ ] Graphiques avancés (tendances, etc.)

---

**Status**: ✅ Prêt pour intégration
**Date**: 2026-04-06
