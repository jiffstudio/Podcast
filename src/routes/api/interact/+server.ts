import { json } from '@sveltejs/kit';
import { MINIMAX_API_KEY, DOUBAO_API_KEY, DOUBAO_BASE_URL } from '$env/static/private';
import { Buffer } from 'buffer';

const CLONE_URL = "https://api.minimaxi.com/v1/voice_clone";

// File IDs from previous upload
const LUO_FILE_ID = "346708620468307";
const TIM_FILE_ID = "346708662636941";

export async function POST({ request }) {
    const { userQuery, currentTimestamp } = await request.json();
    
    if (!userQuery) {
        return json({ error: "No query provided" }, { status: 400 });
    }

    console.log(`Received query: ${userQuery}`);

    try {
        // 1. Generate Script
        const hostText = `说到这里，有个听众问了一个很有意思的问题：“${userQuery}”。Tim你怎么看？`;
        
        // Use Doubao (Ark) Chat to get Tim's answer
        let timText = "这是一个非常好的角度。其实AI不仅仅是工具，更是创意的放大器。";
        
        try {
            console.log("Calling Doubao API (model: doubao-1.8)...");
            const chatResp = await fetch(`${DOUBAO_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DOUBAO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "doubao-1.8", 
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
            
            if (chatResp.ok) {
                const chatData = await chatResp.json();
                if (chatData.choices && chatData.choices[0]) {
                     timText = chatData.choices[0].message.content;
                }
            } else {
                const errorText = await chatResp.text();
                console.error("Doubao Chat API failed:", errorText);
                // If it fails because of model name, we try ep- ID if we had one, but we don't.
                // We'll stick with fallback.
            }
        } catch (e) {
            console.error("Chat generation error:", e);
        }

        console.log("Script:", { hostText, timText });

        // 2. Generate Audio for Host (MiniMax)
        const hostAudioBuffer = await generateVoice(LUO_FILE_ID, "luo_host", hostText);
        
        // 3. Generate Audio for Guest (MiniMax)
        const timAudioBuffer = await generateVoice(TIM_FILE_ID, "tim_response", timText);

        if (!hostAudioBuffer || !timAudioBuffer) {
            throw new Error("Failed to generate audio (TTS step)");
        }

        // 4. Concatenate Audio
        const combinedBuffer = Buffer.concat([hostAudioBuffer, timAudioBuffer]);
        const base64Audio = combinedBuffer.toString('base64');
        const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        
        // 5. Calculate rough duration
        const combinedDuration = combinedBuffer.length / 16000; 

        // 6. Return response
        return json({
            insertionPoint: currentTimestamp + 2, 
            generatedAudioUrl: audioUrl,
            generatedDuration: combinedDuration,
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
            ]
        });

    } catch (e: any) {
        console.error("Error in interact API:", e);
        return json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}

async function generateVoice(fileId: string, voiceId: string, text: string): Promise<Buffer | null> {
    try {
        const resp = await fetch(CLONE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MINIMAX_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_id: fileId,
                voice_id: voiceId,
                text: text,
                model: "speech-2.6-hd"
            })
        });

        if (!resp.ok) {
            console.error(`Voice gen failed for ${voiceId}:`, await resp.text());
            return null;
        }

        const data = await resp.json();
        
        const findUrl = (obj: any): string | null => {
            if (typeof obj === 'string') {
                if (obj.startsWith('http') && (obj.includes('.mp3') || obj.includes('.wav'))) return obj;
            } else if (typeof obj === 'object' && obj !== null) {
                for (const key in obj) {
                    if (['url', 'audio_file', 'file_url'].includes(key) && typeof obj[key] === 'string') {
                        return obj[key];
                    }
                    const res = findUrl(obj[key]);
                    if (res) return res;
                }
            }
            return null;
        };

        const audioUrl = findUrl(data);

        if (audioUrl) {
            const audioResp = await fetch(audioUrl);
            const arrayBuffer = await audioResp.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }
        
        return null;

    } catch (e) {
        console.error(`Error generating voice ${voiceId}:`, e);
        return null;
    }
}
