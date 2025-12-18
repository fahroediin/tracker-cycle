import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    // Hanya terima POST
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    const { username, password } = req.body;
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    const JWT_SECRET = process.env.JWT_SECRET; // Kunci rahasia baru

    if (!JWT_SECRET) {
        return res.status(500).json({ status: 'error', message: 'Server misconfiguration: JWT_SECRET missing' });
    }

    try {
        // 1. Tanya ke Google: "Username & Password ini benar gak?"
        const googleResponse = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: 'login', username, password }),
            redirect: "follow"
        });

        const data = await googleResponse.json();

        // 2. Jika Google bilang Benar...
        if (data.status === 'success') {
            // 3. Vercel membuat "Surat Jalan" (Token) yang ditandatangani
            // Hacker TIDAK BISA memalsukan ini tanpa JWT_SECRET
            const token = jwt.sign(
                { 
                    user: data.user, 
                    role: data.role 
                }, 
                JWT_SECRET, 
                { expiresIn: '12h' } // Token kadaluarsa dalam 12 jam
            );

            // Kembalikan Token ke Frontend
            return res.status(200).json({
                status: 'success',
                user: data.user,
                role: data.role,
                token: token // <--- INI KUNCINYA
            });
        } else {
            // Jika Google bilang salah
            return res.status(401).json(data);
        }

    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
}