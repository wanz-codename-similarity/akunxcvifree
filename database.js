import axios from 'axios';

// Konfigurasi GitHub
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "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";
const NAME_GH = process.env.NAME_GH || "wanz-codename-similarity";
const REPO_GH = process.env.REPO_GH || "xcviv2gen2free";
const CONNECT_PATH = process.env.CONNECT_PATH || "api/connect.js";

// Konfigurasi Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8232068363:AAFaDTDmOCrNmiL1vNu9YYiLeORwNJntwvQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "7950114253";

// Fungsi untuk mengirim notifikasi ke Telegram
async function sendTelegramNotification(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Error sending Telegram notification:', error.message);
    }
}

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        try {
            // Handle request untuk mendapatkan jumlah total akun
            const fileUrl = `https://api.github.com/repos/${NAME_GH}/${REPO_GH}/contents/${CONNECT_PATH}`;
            const headers = {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js'
            };

            const fileResponse = await axios.get(fileUrl, { headers });
            const { content } = fileResponse.data;

            // Decode konten dari base64
            const currentContent = Buffer.from(content, 'base64').toString('utf8');

            // Parse array users
            const usersRegex = /let users = (\[[\s\S]*?\]);/;
            const match = currentContent.match(usersRegex);
            
            if (!match) {
                return res.status(200).json({ 
                    success: true, 
                    total: 0
                });
            }

            const usersArrayStr = match[1];
            let usersArray;
            
            try {
                usersArray = eval(usersArrayStr);
            } catch (e) {
                return res.status(200).json({ 
                    success: true, 
                    total: 0
                });
            }

            return res.status(200).json({ 
                success: true, 
                total: usersArray.length
            });

        } catch (error) {
            console.error('Error fetching users from GitHub:', error);
            return res.status(200).json({ 
                success: true, 
                total: 0
            });
        }
    } else if (req.method === 'POST') {
        try {
            const { username, password, role, createdAt, expired } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            // Step 1: Dapatkan konten file connect.js dari GitHub
            const fileUrl = `https://api.github.com/repos/${NAME_GH}/${REPO_GH}/contents/${CONNECT_PATH}`;
            const headers = {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Node.js'
            };

            const fileResponse = await axios.get(fileUrl, { headers });
            const { content, sha } = fileResponse.data;

            // Decode konten dari base64
            const currentContent = Buffer.from(content, 'base64').toString('utf8');

            // Step 2: Parse dan update array users
            const usersRegex = /let users = (\[[\s\S]*?\]);/;
            const match = currentContent.match(usersRegex);
            
            if (!match) {
                throw new Error('Tidak dapat menemukan deklarasi users dalam file');
            }

            const usersArrayStr = match[1];
            let usersArray;
            
            try {
                usersArray = eval(usersArrayStr);
            } catch (e) {
                throw new Error('Gagal memparse array users: ' + e.message);
            }

            // Tambahkan user baru
            usersArray.push({
                username,
                password,
                role: role || "premium",
                createdAt: createdAt || Date.now(),
                expired: expired || (Date.now() + (30 * 24 * 60 * 60 * 1000))
            });

            // Format ulang array users
            const newUsersArrayStr = JSON.stringify(usersArray, null, 2)
                .replace(/"([^"]+)":/g, '$1:')
                .replace(/"(\d+)"/g, '$1');

            // Ganti array users lama dengan yang baru
            const updatedContent = currentContent.replace(usersRegex, `let users = ${newUsersArrayStr};`);

            // Step 3: Encode konten baru ke base64
            const updatedContentBase64 = Buffer.from(updatedContent, 'utf8').toString('base64');

            // Step 4: Update file di GitHub
            const updateData = {
                message: `Menambah user ${username}`,
                content: updatedContentBase64,
                sha: sha
            };

            await axios.put(fileUrl, updateData, { headers });

            // Step 5: Kirim notifikasi ke Telegram
            const expiredDate = new Date(expired || (Date.now() + (30 * 24 * 60 * 60 * 1000)));
            const formattedDate = expiredDate.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            const telegramMessage = `
🆕 <b>AKUN BARU DIBUAT</b>

👤 <b>Username:</b> <code>${username}</code>
🔑 <b>Password:</b> <code>${password}</code>
⭐ <b>Role:</b> ${role || "premium"}
📅 <b>Kadaluarsa:</b> ${formattedDate}

⏰ <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}
            `;
            
            await sendTelegramNotification(telegramMessage);

            res.status(200).json({
                success: true,
                message: `Akun ${username} berhasil dibuat`,
                username,
                password
            });

        } catch (error) {
            console.error('Error updating GitHub file:', error.response ? error.response.data : error.message);
            res.status(500).json({ 
                error: 'Gagal mengupdate file di GitHub',
                details: error.response ? error.response.data : error.message
            });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}