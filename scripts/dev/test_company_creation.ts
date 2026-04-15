import axios from 'axios';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const API_URL = `http://localhost:${process.env.PORT || 3000}`;
const prisma = new PrismaClient();

async function main() {
  console.log(`🚀 Connexion Company à ${API_URL}...`);
  
  // Login as Company
  let token = '';
  try {
    const loginRes = await axios.post(`${API_URL}/auth/signin`, {
      email: 'negzaouioussama15@gmail.com',
      password: '12345678'
    });
    token = loginRes.data.tokens.accessToken;
    console.log("🔑 Authentification COMPANY réussie.");
  } catch (error: any) {
    console.error("❌ Échec de l'authentification:", error.response?.data?.message || error.message);
    return;
  }

  // Create Hackathon with Prize 0
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 2); // Start +2 days
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000); // 24h Duration

  try {
    const response = await axios.post(`${API_URL}/competitions`, {
      title: "Hackathon Company (Gratuit)",
      description: "Ceci est un hackathon de test créé par un compte COMPANY avec un rewardPool de 0.",
      difficulty: 'HARD',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      rewardPool: 0,
      maxParticipants: 100,
      antiCheatEnabled: true,
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const competitionId = response.data.id;
    console.log(`\n✅ Hackathon créé avec succès par COMPANY (ID: ${competitionId})`);
    console.log(`   Titre: Hackathon Company (Gratuit)`);
    console.log(`   Récompense: 0`);
    
    const checkpoints = await prisma.competitionCheckpoint.findMany({
      where: { competitionId }
    });
    console.log(`   Checkpoints générés: ${checkpoints.length} (Attendu: 3 pour 24h)`);

  } catch (error: any) {
    console.error(`\n❌ Échec de la création:`, error.response?.data?.message || error.message);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
