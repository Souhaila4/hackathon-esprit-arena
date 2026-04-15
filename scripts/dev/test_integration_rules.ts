import axios from 'axios';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const API_URL = `http://localhost:${process.env.PORT || 3000}`;
const prisma = new PrismaClient();

async function createHackathon(token: string, title: string, durationHours: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1); // Start tomorrow
  startDate.setHours(10, 0, 0, 0);

  const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

  try {
    const response = await axios.post(`${API_URL}/competitions`, {
      title,
      description: `Ceci est un hackathon de test pour vérifier les nouvelles règles de gestion des checkpoints (Durée: ${durationHours}h).`,
      difficulty: 'MEDIUM',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      rewardPool: 1000,
      maxParticipants: 50,
      antiCheatEnabled: true,
      antiCheatThreshold: 70
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const competitionId = response.data.id;
    console.log(`\n✅ Hackathon "${title}" créé (ID: ${competitionId})`);
    console.log(`   Durée: ${durationHours}h | Start: ${startDate.toISOString()} | End: ${endDate.toISOString()}`);

    // Check generated checkpoints in DB
    const checkpoints = await prisma.competitionCheckpoint.findMany({
      where: { competitionId },
      orderBy: { order: 'asc' }
    });

    console.log(`   Checkpoints générés (${checkpoints.length}):`);
    checkpoints.forEach(cp => {
      console.log(`     - ${cp.title}: Due ${cp.dueDate.toISOString()}`);
    });

    return competitionId;
  } catch (error: any) {
    console.error(`\n❌ Échec de la création du hackathon "${title}":`, error.response?.data?.message || error.message);
  }
}

async function main() {
  console.log(`🚀 Connexion à ${API_URL}...`);
  
  // Step 1: Login
  let token = '';
  try {
    const loginRes = await axios.post(`${API_URL}/auth/signin`, {
      email: 'admin@test.com',
      password: 'admin'
    });
    token = loginRes.data.tokens.accessToken;
    console.log("🔑 Authentification réussie.");
  } catch (error: any) {
    console.error("❌ Échec de l'authentification:", error.response?.data?.message || error.message);
    return;
  }

  // Step 2: Create 3 Hackathons
  
  // 1. Durée < 19h (Test 10h -> Intervalle 4h -> 2 CP)
  await createHackathon(token, "Test 10h (Intervalle 4h)", 10);

  // 2. Durée >= 19h (Test 24h -> Intervalle 6h -> 3 CP car le 24h est blackout)
  await createHackathon(token, "Test 24h (Intervalle 6h)", 24);

  // 3. Durée Longue (Test 70h -> Intervalle 6h -> 11 CP)
  await createHackathon(token, "Test 70h (Intervalle 6h)", 70);

  // 4. Test Erreur Duration < 8h
  console.log("\n🧪 Test du réglage Durée Minimale (7h)...");
  await createHackathon(token, "Test 7h (Doit échouer)", 7);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
