import { json } from '@sveltejs/kit';
import { MINIMAX_API_KEY, DOUBAO_API_KEY, DOUBAO_BASE_URL } from '$env/static/private';
import { Buffer } from 'buffer';

import type { RequestHandler } from './$types';

// MiniMax T2S (Text-to-Speech) V1 API URL - often more compatible with older cloned voices
const T2S_V1_URL = "https://api.minimaxi.com/v1/text_to_speech";

// Voice IDs as requested by user in the latest message
const LUO_VOICE_ID = "luo_clone_v1";
const TIM_VOICE_ID = "tim_clone_v1";

export const POST: RequestHandler = async ({ request }) => {
    const { userQuery, currentTimestamp } = await request.json();
    
    if (!userQuery) {
        return json({ error: "No query provided" }, { status: 400 });
    }

    let debugLogs: string[] = [];
    const log = (msg: string) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const formattedMsg = `[${timestamp}] ${msg}`;
        console.log(formattedMsg);
        debugLogs.push(formattedMsg);
    };

    log(`Processing query: ${userQuery}`);

    try {
        // 1. Generate Script using Doubao
        const hostText = `说到这里，有个听众问了一个很有意思的问题：“${userQuery}”。Tim你怎么看？`;
        let timText = "这是一个非常好的角度。其实AI不仅仅是工具，更是创意的放大器。我们现在的很多选题，如果没有AI的辅助，可能根本无法在有限的时间内完成。";
        
        try {
            log("Calling Doubao API...");
            const chatResp = await fetch(`${DOUBAO_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DOUBAO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "doubao-seed-1-6-251015", 
                    messages: [
                        {
                            role: "system",
                            content: "你现在扮演影视飓风的Tim，一位专业的科技视频创作者。请简短回答用户的问题。回答要口语化，像在播客聊天。50字以内。"
                        },
                        {
                            role: "user",
                            content: userQuery
                        }
                    ],
                    stream: false
                })
            });
            
            const chatData = await chatResp.json();
            if (chatResp.ok) {
                if (chatData.choices && chatData.choices[0]) {
                     timText = chatData.choices[0].message.content;
                     log("Doubao Success");
                }
            } else {
                log(`Doubao API Error: ${chatData.error?.message || JSON.stringify(chatData)}`);
                log("Using fallback script text.");
            }
        } catch (e: any) {
            log(`Doubao Network Error: ${e.message}`);
        }

        // 2. Generate Audio using T2S V1
        // We'll try the V1 API which is often more reliable for legacy cloned voices
        log("Generating host audio (T2S V1)...");
        const hostAudioBuffer = await generateT2S(LUO_VOICE_ID, hostText, log);
        
        log("Generating guest audio (T2S V1)...");
        const timAudioBuffer = await generateT2S(TIM_VOICE_ID, timText, log);

        if (!hostAudioBuffer || !timAudioBuffer) {
            const errorMsg = `Audio generation failed. Host: ${!!hostAudioBuffer}, Guest: ${!!timAudioBuffer}`;
            log(errorMsg);
            throw new Error(errorMsg);
        }

        // 3. Concatenate and Return
        log("Combining audio buffers...");
        const combinedBuffer = Buffer.concat([hostAudioBuffer, timAudioBuffer]);
        const base64Audio = combinedBuffer.toString('base64');
        const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        
        // Duration estimation: Bitrate 128kbps = 16KB/s
        const duration = combinedBuffer.length / 16000;

        return json({
            insertionPoint: currentTimestamp + 1,
            generatedAudioUrl: audioUrl,
            generatedDuration: duration,
            transcript: [
                {
                    speaker: "罗永浩 (AI)",
                    content: hostText,
                    timestamp: "AI-Gen",
                    seconds: 0,
                    type: 'generated'
                },
                {
                    speaker: "Tim (AI)",
                    content: timText,
                    timestamp: "AI-Gen",
                    seconds: hostAudioBuffer.length / 16000,
                    type: 'generated'
                }
            ],
            debugLogs 
        });

    } catch (e: any) {
        log(`CRITICAL ERROR: ${e.message}`);
        return json({ 
            error: e.message,
            debugLogs 
        }, { status: 500 });
    }
}

async function generateT2S(voiceId: string, text: string, log: Function): Promise<Buffer | null> {
    try {
        log(`Calling MiniMax T2S V1 for voice ${voiceId}...`);
        const resp = await fetch(T2S_V1_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MINIMAX_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "speech-01", // Standard V1 model
                text: text,
                stream: false,
                voice_id: voiceId,
                audio_setting: {
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: "mp3"
                }
            })
        });

        // V1 API can return binary audio or a JSON with a URL depending on the specific endpoint configuration
        const contentType = resp.headers.get('content-type') || '';
        
        if (resp.ok && contentType.includes('audio')) {
            log(`Success: Received binary audio for ${voiceId}`);
            const ab = await resp.arrayBuffer();
            return Buffer.from(ab);
        }

        const data = await resp.json().catch(() => ({}));
        
        if (!resp.ok) {
            log(`T2S V1 API Error (${resp.status}) for ${voiceId}: ${JSON.stringify(data.base_resp || data)}`);
            return null;
        }

        // Some V1 responses return a URL in a nested object
        const findUrl = (obj: any): string | null => {
            if (typeof obj === 'string' && obj.startsWith('http')) return obj;
            if (typeof obj === 'object' && obj !== null) {
                for (const key in obj) {
                    const res = findUrl(obj[key]);
                    if (res) return res;
                }
            }
            return null;
        };

        const audioUrl = findUrl(data);
        if (audioUrl) {
            log(`Found audio URL in JSON response: ${audioUrl}`);
            const audioResp = await fetch(audioUrl);
            const ab = await audioResp.arrayBuffer();
            return Buffer.from(ab);
        }

        log(`Unexpected T2S V1 response for ${voiceId}: ${JSON.stringify(data)}`);
        return null;

    } catch (e: any) {
        log(`T2S V1 Network Error for ${voiceId}: ${e.message}`);
        return null;
    }
}
