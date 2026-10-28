import 'dotenv/config';
import axios from 'axios';

async function checkEndpoint() {
  const apiKey = process.env.SYNC_API_KEY || '6ab95669b2c44215bf6fe54d1a05357f0f65094c9d6915180121c0f2299f7adc';
  const url = 'https://dizalica.imagomatrix.com/api/v1/member-sync/import-land-state';

  try {
    const res = await axios.post(url, {}, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-sync-api-key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 10000,
    });
    console.log('Status:', res.status, res.data);
    return true;
  } catch (err: any) {
    if (err.response?.status === 400) {
      console.log('✅ Endpoint je aktivan na produkciji! (Status 400 - očekivano za prazan body)');
      return true;
    } else if (err.response?.status === 404) {
      console.log('⏳ Poslužitelj se još rebuila/redeploya (Status 404)...');
      return false;
    } else {
      console.log('Response status:', err.response?.status, err.response?.data || err.message);
      return false;
    }
  }
}

checkEndpoint();
