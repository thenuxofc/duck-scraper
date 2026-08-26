const https = require('https');

// Generate a unique ID for each request
const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Helper for HTTPS requests
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

// Helper to fetch the current Fe Version from Duck.ai homepage
const getFeVersion = async () => {
    try {
        const res = await makeRequest({
            hostname: 'duck.ai',
            path: '/',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        // Try to extract the script version
        const match = res.data.match(/x-fe-version[^>]*=["']([^"']+)["']/i);
        if (match) return match[1];
        
        // Fallback: Try to find version in script src
        const scriptMatch = res.data.match(/scraper_[\w-]+\.js/);
        if (scriptMatch) {
             const versionMatch = scriptMatch[0].match(/scraper_([\w-]+)\.js/);
             if (versionMatch) return `scraper_${versionMatch[1]}`;
        }

        return "scraper_20260825_133734_ET-ea4548e57b2e941ae25474516138826d8bb4d6ab";
    } catch (e) {
        console.error("Fe Version Fetch Error:", e);
        return "scraper_20260825_133734_ET-ea4548e57b2e941ae25474516138826d8bb4d6ab";
    }
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
        const { prompt, messages, model } = JSON.parse(event.body || '{}');
        
        // Use the specific model requested
        const targetModel = model || "gpt-5.6-luna";

        // 1. Get dynamic Fe Version
        const feVersion = await getFeVersion();

        // 2. Base Headers
        const baseHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json',
            'X-Ddg-Journey-Id': generateId(),
            'X-Fe-Version': feVersion,
            'X-Vqd-Accept': '1',
            'Referer': 'https://duck.ai/',
            'Origin': 'https://duck.ai',
            'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        };

        // 3. Send Chat Request
        const response = await makeRequest({
            hostname: 'duck.ai',
            path: '/duckchat/v1/chat',
            method: 'POST',
            headers: baseHeaders
        }, {
            prompt: prompt,
            model: targetModel,
            messages: messages || [], 
            conversation_id: null,
            attachments: []
        });

        // 4. Parse SSE
        const lines = response.data.split('\n');
        let fullResponse = "";
        let hasContent = false;
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (!jsonStr) continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'message' && parsed.delta) {
                        fullResponse += parsed.delta;
                        hasContent = true;
                    }
                } catch (e) {
                    // Ignore partial JSON
                }
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                response: fullResponse,
                model: targetModel
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
