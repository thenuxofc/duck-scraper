const https = require('https');

const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

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
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { prompt, messages } = JSON.parse(event.body || '{}');
        const journeyId = generateId();
        
        const response = await makeRequest({
            hostname: 'duck.ai',
            path: '/duckchat/v1/chat',
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json',
                'X-Ddg-Journey-Id': journeyId,
                'Referer': 'https://duck.ai/',
                'Origin': 'https://duck.ai'
            }
        }, {
            prompt: prompt,
            model: "llama-3.1-70b",
            messages: messages || [],
            conversation_id: null
        });

        const lines = response.data.split('\n');
        let fullResponse = "";
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
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
            body: JSON.stringify({ response: fullResponse })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
