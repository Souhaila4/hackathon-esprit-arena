import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_URL = `http://localhost:${process.env.PORT || 3000}`;

async function debug() {
  console.log(`Connecting to ${API_URL}...`);
  try {
    const loginRes = await axios.post(`${API_URL}/auth/signin`, {
      email: 'admin@test.com',
      password: 'admin'
    });
    const token = loginRes.data.accessToken;
    console.log("Token obtained:", token ? "YES" : "NO");

    const meRes = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Auth Me Result:", JSON.stringify(meRes.data, null, 2));
  } catch (error: any) {
    console.error("Error:", error.response?.status, error.response?.data);
  }
}

debug();
