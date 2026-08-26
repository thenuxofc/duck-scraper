const https = require('https');

// Generate a valid UUID v4
const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Helper to make HTTPS requests
const makeRequest = (options, body = null) => {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { prompt, messages } = JSON.parse(event.body || '{}');
        
        // 1. Initialize Journey ID and Cookie
        const journeyId = generateId();
        
        // 2. Fetch Homepage to get the correct Fe Version and Cookies
        const homeRes = await makeRequest({
            hostname: 'duck.ai',
            path: '/',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        // Extract Fe Version from script tags
        let feVersion = "scraper_20260825_133734_ET-ea4548e57b2e941ae25474516138826d8bb4d6ab";
        const versionMatch = homeRes.data.match(/scraper_([\w-]+)\.js/);
        if (versionMatch) {
            feVersion = `scraper_${versionMatch[1]}`;
        }

        // Extract Set-Cookie if present
        const setCookieHeader = homeRes.headers['set-cookie'];
        const cookies = setCookieHeader ? setCookieHeader.map(c => c.split(';')[0]).join('; ') : '';

        // 3. Send Chat Request with valid Cookies and Journey ID
        const chatRes = await makeRequest({
            hostname: 'duck.ai',
            path: '/duckchat/v1/chat',
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json',
                'X-Ddg-Journey-Id': journeyId,
                'X-Fe-Version': feVersion,
                'X-Vqd-Accept': '1',
                'Referer': 'https://duck.ai/',
                'Origin': 'https://duck.ai',
                'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Cookie': cookies // Important: Pass the cookie from the homepage
            }
        }, {
            prompt: prompt,
            model: "gpt-5.6-luna",
            messages: messages || [],
            conversation_id: null,
            attachments: []
        });

        // 4. Parse SSE
        const lines = chatRes.data.split('\n');
        let fullResponse = "";
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (!jsonStr) continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'message' && parsed.delta) {
                        fullResponse += parsed.delta;
                    }
                } catch (e) {}
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                response: fullResponse
            })
        };

    } catch (error) {
        console.error("Scrape Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};
