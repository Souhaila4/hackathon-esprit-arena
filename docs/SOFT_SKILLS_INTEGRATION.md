# 🚀 Intégration du Système de Soft Skills au Company Dashboard

## 📋 Vue d'ensemble

L'application **Soft-Skills-Evaluation-System** a été intégrée au company dashboard pour permettre aux recruteurs d'analyser les compétences douces des candidats via des vidéos.

## 🎯 Fonctionnalités Intégrées

### 1. **SoftSkillsAnalyzer Component**
- 📹 Upload de vidéos (MP4, MOV, AVI, MKV, WEBM)
- ✨ Analyse des émotions faciales et vocales (via API Python)
- 📊 Calcul automatique des soft skills:
  - Communication
  - Empathy
  - Confidence
  - Leadership
  - Adaptability
  - Stress Management
- 🎯 Score global /10
- 📈 Graphiques de visualisation

### 2. **CandidatesResults Component**
- 👥 Liste des candidats analysés
- 📊 Scores globaux par candidat
- 🔍 Modal de détails complets
- 📧 Option pour contacter les candidats
- 🎬 Historique d'analyses

## 🔗 Architecture d'Intégration

```
Frontend (Next.js)
├── /company-dashboard/page.tsx
├── /components/company/
│   ├── SoftSkillsAnalyzer.tsx
│   └── CandidatesResults.tsx
└── API calls to Python backend

Backend Python (Flask/FastAPI)
├── api_soft_skills.py
├── api_emotion.py
└── Models trained (Emotions, Soft Skills)
```

## 📝 Configuration Requise

### **Backend Python**
Installation des dépendances:
```bash
cd Soft-Skills-Evaluation-System-main
pip install -r requirements.txt
```

Lancer l'API:
```bash
# FastAPI
python -m uvicorn api_emotion:app --reload --host 0.0.0.0 --port 5000

# Ou Flask
python api_soft_skills.py
```

### **Frontend React/Next.js**
Les composants sont déjà intégrés:
```bash
cd front
npm install
npm run dev
```

## 🔌 Endpoints API

### Upload et Analyse de Vidéo
```
POST /api/analyze
Content-Type: multipart/form-data

Body:
- video: File (mp4, mov, avi, mkv, webm)
- name: string (nom du candidat)

Response:
{
  "session_id": "uuid",
  "name": "Candidate Name",
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

## 📊 Mapping Émotions → Soft Skills

| Soft Skill | Happy | Neutral | Surprise | Sad | Angry | Fear | Disgust |
|-----------|-------|---------|----------|-----|-------|------|---------|
| Communication | 0.9 | 0.7 | 0.6 | 0.3 | 0.2 | 0.3 | 0.4 |
| Empathy | 0.7 | 0.5 | 0.5 | 0.8 | 0.2 | 0.6 | 0.3 |
| Confidence | 0.8 | 0.7 | 0.4 | 0.2 | 0.6 | 0.1 | 0.3 |
| Leadership | 0.7 | 0.8 | 0.5 | 0.3 | 0.5 | 0.2 | 0.4 |
| Adaptability | 0.7 | 0.6 | 0.8 | 0.4 | 0.3 | 0.5 | 0.4 |
| Stress Management | 0.7 | 0.8 | 0.5 | 0.4 | 0.2 | 0.1 | 0.3 |

## 🎨 Composants React

### SoftSkillsAnalyzer
```jsx
<SoftSkillsAnalyzer 
  candidateName="John Doe"
  onAnalysisComplete={(results) => console.log(results)}
/>
```

### CandidatesResults
```jsx
<CandidatesResults />
```

## 🔐 Intégration au Company Dashboard

Ajouter à `/company-dashboard/page.tsx`:

```jsx
import SoftSkillsAnalyzer from "../components/company/SoftSkillsAnalyzer";
import CandidatesResults from "../components/company/CandidatesResults";

// Dans le renderdu conditionnel:
{activeView === "SOFT_SKILLS" && (
  <div className="space-y-8">
    <h2 className="text-3xl font-bold">Analyse des Soft Skills</h2>
    <SoftSkillsAnalyzer />
    <CandidatesResults />
  </div>
)}
```

## 📱 Variables d'Environnement

### Backend `.env`
```
FLASK_ENV=development
PORT=5000
UPLOAD_FOLDER=uploads
MAX_CONTENT_LENGTH=524288000  # 500MB
```

### Frontend `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:3001
SOFT_SKILLS_API_URL=http://localhost:5000
```

## 🧪 Tests

### Test de l'API
```bash
curl -X POST http://localhost:5000/api/analyze \
  -F "video=@video.mp4" \
  -F "name=Test User"
```

### Test du composant frontend
```jsx
// src/__tests__/SoftSkillsAnalyzer.test.tsx
describe('SoftSkillsAnalyzer', () => {
  it('uploads video and displays results', async () => {
    // Test code
  });
});
```

## 📈 Prochaines Étapes

1. **Backend NestJS Integration** - Créer des endpoints NestJS qui appellent l'API Python
2. **Database** - Sauvegarder les analyses dans la BD
3. **Real-time Notifications** - Notifier les companies quand une analyse est terminée
4. **Advanced Analytics** - Dashboard avec comparaisons, tendances, etc.
5. **Export** - Générer des rapports PDF pour les candidats

## 🐛 Troubleshooting

### Erreur: "API not reachable"
- Vérifier que le server API Python tourne (port 5000)
- Vérifier les CORS settings

### Erreur: "Video format not supported"
- Utiliser MP4, MOV, AVI, MKV ou WEBM
- Max 500MB

### Erreur: "GPU not available"
- L'API fonctionnera en CPU (plus lent mais fonctionnel)

## 📚 Ressources

- API Code: `Soft-Skills-Evaluation-System-main/`
- Components: `front/app/components/company/`
- Dashboard Page: `front/app/company-dashboard/`

---

**Status**: ✅ Intégration complète
**Last Updated**: 2026-04-06
