import { json } from '@sveltejs/kit';
import { MINIMAX_API_KEY, DOUBAO_API_KEY, DOUBAO_BASE_URL } from '$env/static/private';
import { Buffer } from 'buffer';
import mp3Duration from 'mp3-duration';
import { promisify } from 'util';

import type { RequestHandler } from './$types';

// Promisify mp3Duration
const getDuration = promisify(mp3Duration);

// MiniMax T2A V2 API URL
const T2A_V2_URL = "https://api.minimaxi.com/v1/t2a_v2";

// Voice IDs
const LUO_VOICE_ID = "luo_yonghao_clone_v1";
const TIM_VOICE_ID = "tim_clone_v1";

export const POST: RequestHandler = async ({ request }) => {
    const { userQuery } = await request.json();
    
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

    try {
        log(`Generating AI content for: ${userQuery}`);

        // Step 1: Generate Script
        const hostText = `说到这里，有个听众问了一个很有意思的问题："${userQuery}"。Tim你怎么看？`;
        let timText = "这是一个非常好的角度。其实AI不仅仅是工具，更是创意的放大器。";
        
        try {
            log("Calling Doubao API for Tim's response...");
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
                            content: "你现在扮演影视飓风的Tim，回答要口语化，像在播客聊天。50字以内。"
                        },
                        {
                            role: "user",
                            content: userQuery
                        }
                    ],
                    temperature: 0.1,
                    stream: false
                })
            });
            const chatData = await chatResp.json();
            if (chatResp.ok && chatData.choices?.[0]) {
                timText = chatData.choices[0].message.content;
                log("Doubao Success");
            }
        } catch (e: any) {
            log(`Doubao Error: ${e.message}`);
        }

        // Step 2: Generate Audio
        log("Generating audio for both speakers...");
        const [hostAudio, timAudio] = await Promise.all([
            generateT2A(LUO_VOICE_ID, hostText, log),
            generateT2A(TIM_VOICE_ID, timText, log)
        ]);

        if (!hostAudio || !timAudio) {
            throw new Error(`Audio generation failed. Host: ${!!hostAudio}, Guest: ${!!timAudio}`);
        }

        // Step 3: Calculate durations
        log("Calculating accurate duration...");
        const hostSeconds = await getDuration(hostAudio);
        const timSeconds = await getDuration(timAudio);
        
        log(`Accurate durations: Host=${hostSeconds}s, Tim=${timSeconds}s`);

        // Return array of segments, each with its own audio and transcript
        return json({
            segments: [
                {
                    audioUrl: `data:audio/mp3;base64,${hostAudio.toString('base64')}`,
                    duration: hostSeconds,
                    transcript: {
                        speaker: "罗永浩 (AI)",
                        content: hostText,
                        timestamp: "AI-Gen",
                        type: 'generated'
                    }
                },
                {
                    audioUrl: `data:audio/mp3;base64,${timAudio.toString('base64')}`,
                    duration: timSeconds,
                    transcript: {
                        speaker: "Tim (AI)",
                        content: timText,
                        timestamp: "AI-Gen",
                        type: 'generated'
                    }
                }
            ],
            debugLogs 
        });

    } catch (e: any) {
        log(`CRITICAL ERROR: ${e.message}`);
        return json({ error: e.message, debugLogs }, { status: 500 });
    }
};

async function generateT2A(voiceId: string, text: string, log: Function): Promise<Buffer | null> {
    try {
        const resp = await fetch(T2A_V2_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "speech-2.6-hd",
                text,
                stream: false,
                voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0, emotion: "happy" },
                audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }
            })
        });
        const data = await resp.json();
        if (resp.ok && data.data?.audio) {
            return Buffer.from(data.data.audio, 'hex');
        }
        log(`T2A API Error for ${voiceId}: ${JSON.stringify(data)}`);
        return null;
    } catch (e: any) {
        log(`T2A Network Error: ${e.message}`);
        return null;
    }
}
