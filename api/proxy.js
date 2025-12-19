import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    const JWT_SECRET = process.env.JWT_SECRET;
    
    // Ambil Secret Key dari Env Vercel
    const GAS_SECRET = process.env.GAS_SECRET; 

    // --- Cek Token JWT (Verifikasi Sesi) ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // --- PROSES REQUEST ---
        if (req.method === 'POST') {
             if (!req.body) req.body = {};
             
             // Paksa User dari Token (Anti-Hack)
             req.body.user = decoded.user;
             
             // [PENTING] SISIPKAN KUNCI RAHASIA KE GOOGLE
             req.body.secretKey = GAS_SECRET; 
        }

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
            redirect: "follow"
        });

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
}