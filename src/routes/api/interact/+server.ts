import { json } from '@sveltejs/kit';
import { MINIMAX_API_KEY, DOUBAO_API_KEY, DOUBAO_BASE_URL } from '$env/static/private';
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';

const CLONE_URL = "https://api.minimaxi.com/v1/voice_clone";
const UPLOAD_URL = "https://api.minimaxi.com/v1/files/upload";

// Initial File IDs (from your previous successful runs)
let luoFileId = "346708620468307";
let timFileId = "346708662636941";

export async function POST({ request }) {
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
        let timText = "这是一个非常好的角度。其实AI不仅仅是工具，更是创意的放大器。";
        
        try {
            log("Calling Doubao API...");
            const chatResp = await fetch(`${DOUBAO_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DOUBAO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    // If 'doubao-1.8' fails, it means you need the Endpoint ID (ep-xxx)
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
            
            const chatData = await chatResp.json();
            if (chatResp.ok) {
                if (chatData.choices && chatData.choices[0]) {
                     timText = chatData.choices[0].message.content;
                     log("Doubao Success");
                }
            } else {
                log(`Doubao API Error: ${JSON.stringify(chatData.error || chatData)}`);
                log("Using fallback script text.");
            }
        } catch (e: any) {
            log(`Doubao Network Error: ${e.message}`);
        }

        // 2. Generate Audio
        log("Generating host audio (TTS)...");
        let hostAudio = await generateVoiceWithRetry(luoFileId, "luo_host", hostText, "static/luo_pure_2min.mp3", log);
        
        log("Generating guest audio (TTS)...");
        let timAudio = await generateVoiceWithRetry(timFileId, "tim_response", timText, "static/tim_pure_2min.mp3", log);

        if (!hostAudio || !timAudio) {
            const errorMsg = `Audio generation failed. Host: ${!!hostAudio}, Guest: ${!!timAudio}`;
            log(errorMsg);
            throw new Error(errorMsg);
        }

        // 3. Concatenate and Return
        log("Combining audio buffers...");
        const combinedBuffer = Buffer.concat([hostAudio.buffer, timAudio.buffer]);
        const base64Audio = combinedBuffer.toString('base64');
        const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        
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
                    seconds: hostAudio.buffer.length / 16000,
                    type: 'generated'
                }
            ],
            debugLogs // Return logs to frontend for easier debugging
        });

    } catch (e: any) {
        log(`CRITICAL ERROR: ${e.message}`);
        return json({ 
            error: e.message,
            debugLogs 
        }, { status: 500 });
    }
}

async function generateVoiceWithRetry(fileId: string, voiceId: string, text: string, samplePath: string, log: Function): Promise<{ buffer: Buffer } | null> {
    // Attempt 1
    log(`TTS Attempt 1 for ${voiceId} with ID ${fileId}`);
    let result = await generateVoice(fileId, voiceId, text, log);
    
    if (!result) {
        log(`TTS Attempt 1 failed for ${voiceId}. Re-uploading ${samplePath}...`);
        if (fs.existsSync(samplePath)) {
            const newFileId = await uploadFile(samplePath, log);
            if (newFileId) {
                log(`Upload success. New File ID: ${newFileId}. Retrying TTS...`);
                // Update persistent IDs
                if (voiceId.includes("luo")) luoFileId = newFileId;
                else timFileId = newFileId;
                
                result = await generateVoice(newFileId, voiceId, text, log);
                if (result) log(`TTS Attempt 2 success for ${voiceId}`);
                else log(`TTS Attempt 2 failed for ${voiceId}`);
            } else {
                log(`Upload failed for ${samplePath}`);
            }
        } else {
            log(`Sample file not found: ${samplePath}`);
        }
    } else {
        log(`TTS Attempt 1 success for ${voiceId}`);
    }
    
    return result ? { buffer: result } : null;
}

async function uploadFile(filePath: string, log: Function): Promise<string | null> {
    try {
        const fullPath = path.resolve(filePath);
        const fileBuffer = fs.readFileSync(fullPath);
        const fileName = path.basename(filePath);

        const formData = new FormData();
        // SvelteKit's fetch handles FormData with Blobs correctly in Node 20+
        formData.append('file', new Blob([fileBuffer]), fileName);
        formData.append('purpose', 'voice_clone');

        const resp = await fetch(UPLOAD_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MINIMAX_API_KEY}`
            },
            body: formData
        });

        const data = await resp.json();
        if (!resp.ok) {
            log(`Upload API Error: ${JSON.stringify(data)}`);
            return null;
        }
        return data.file?.file_id || null;
    } catch (e: any) {
        log(`Upload Network Error: ${e.message}`);
        return null;
    }
}

async function generateVoice(fileId: string, voiceId: string, text: string, log: Function): Promise<Buffer | null> {
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

        const data = await resp.json();
        
        if (!resp.ok) {
            log(`TTS API Error for ${voiceId}: ${JSON.stringify(data.base_resp || data)}`);
            return null;
        }

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
            const audioResp = await fetch(audioUrl);
            const ab = await audioResp.arrayBuffer();
            return Buffer.from(ab);
        } else {
            log(`No audio URL found in TTS response for ${voiceId}`);
            return null;
        }
    } catch (e: any) {
        log(`TTS Network Error for ${voiceId}: ${e.message}`);
        return null;
    }
}
