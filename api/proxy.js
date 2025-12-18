// api/proxy.js
export default async function handler(req, res) {
    // 1. Ambil URL Rahasia dari Environment Variable Vercel
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

    if (!GOOGLE_SCRIPT_URL) {
        return res.status(500).json({ status: 'error', message: 'Server configuration error: Missing URL' });
    }

    try {
        // 2. Tentukan Method (GET atau POST)
        const method = req.method;
        
        let options = {
            method: method,
            headers: {
                "Content-Type": "application/json",
            },
        };

        // 3. Jika POST (Login/Add/Update), sertakan Body data
        if (method === 'POST') {
            // req.body di Vercel sudah berupa object jika content-type application/json
            // Kita perlu stringify ulang untuk dikirim ke Google Script
            options.body = JSON.stringify(req.body);
        }

        // 4. Request ke Google Script (Server to Server)
        const response = await fetch(GOOGLE_SCRIPT_URL, options);
        
        // Google Script kadang redirect (302), fetch nodejs biasanya otomatis follow.
        // Kita ambil JSON hasilnya
        const data = await response.json();

        // 5. Kembalikan hasil ke Frontend
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ 
            status: 'error', 
            message: 'Failed to fetch data from Google', 
            error: error.message 
        });
    }
}