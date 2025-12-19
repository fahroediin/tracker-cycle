import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send("Method not allowed");

    const { username, password } = req.body;
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    const JWT_SECRET = process.env.JWT_SECRET;
    
    // Ambil Secret Key dari Env Vercel
    const GAS_SECRET = process.env.GAS_SECRET;

    try {
        // [PENTING] Kirim Secret Key saat Login juga!
        const googleResponse = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                action: 'login', 
                username, 
                password,
                secretKey: GAS_SECRET // <--- INI DIA
            }),
            redirect: "follow"
        });

        const data = await googleResponse.json();

        if (data.status === 'success') {
            const token = jwt.sign(
                { user: data.user, role: data.role }, 
                JWT_SECRET, 
                { expiresIn: '12h' }
            );
            return res.status(200).json({ status: 'success', user: data.user, role: data.role, token });
        } else {
            return res.status(401).json(data);
        }

    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
}