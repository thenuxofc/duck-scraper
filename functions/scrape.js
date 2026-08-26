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

exports.handler = async (event, context) => {
    // CORS Headers
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
        
        // Default model if not specified
        const targetModel = model || "llama-3.1-70b";
        
        // Base headers mimicking a browser
        const baseHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json',
            'X-Ddg-Journey-Id': generateId(),
            'Referer': 'https://duck.ai/',
            'Origin': 'https://duck.ai',
            'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"'
        };

        const response = await makeRequest({
            hostname: 'duck.ai',
            path: '/duckchat/v1/chat',
            method: 'POST',
            headers: baseHeaders
        }, {
            prompt: prompt,
            model: targetModel,
            messages: messages || [],
            conversation_id: null
        });

        // Parse SSE (Server-Sent Events)
        const lines = response.data.split('\n');
        let fullResponse = "";
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
                try {
                    const parsed = JSON.parse(jsonStr);
                    // 'message' type contains the actual text chunks
                    if (parsed.type === 'message' && parsed.delta) {
                        fullResponse += parsed.delta;
                    }
                } catch (e) {
                    // Ignore parse errors on partial chunks
                }
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
