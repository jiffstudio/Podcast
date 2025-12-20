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
    const { userQuery, currentTimestamp, contextLines } = await request.json();
    
    if (!userQuery) {
        return json({ error: "No query provided" }, { status: 400 });
    }
    
    if (!contextLines || contextLines.length === 0) {
        return json({ error: "No context provided" }, { status: 400 });
    }

    let debugLogs: string[] = [];
    const log = (msg: string) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const formattedMsg = `[${timestamp}] ${msg}`;
        console.log(formattedMsg);
        debugLogs.push(formattedMsg);
    };

    try {
        log(`Processing query: ${userQuery}`);
        log(`Current timestamp: ${currentTimestamp}s`);
        log(`Context lines: ${contextLines.length}`);

        // Step 1: Call LLM to determine insertion point
        log("Calling Doubao to determine insertion point...");
        
        const contextText = contextLines.map((line: any) => 
            `${line.index}、【${line.seconds.toFixed(1)}秒】${line.speaker}: ${line.content}`
        ).join('\n');
        
        const insertPrompt = `**角色** 
你是一个播客理解大师，擅长理解对话人的语气，非常熟悉对话之间的逻辑。

**任务**
你现在收到了一条用户的输入，和用户输入前后10句上下文。为了给系统加载留出时间，你需要在用户输入的时刻后，至少20秒以后的位置，找到一个适合开启这个话题的地方。

**要求**
1、你不需要告诉我该说什么，我只需要返回一个编号，告诉嘉宾在何处开始这个新话题最合适。
2、输出的编号表示插入的位置在某个句子之后。
3、一般情况下，你的插入不能在一个提问之后。
4、你需要理解这个话题是否和上下文有关，如果上下文有相关，最好不要出现太明显的话题跳跃，由于加载所需的延迟，容忍小范围的跳跃。
5、【第一优先级】请务必找到用户输入时刻至少20秒以后的位置，保证系统有足够的时间准备

**输出**
【编号】

**输入**
A、上下文（按照时间编号，第10条为用户输入时嘉宾正在说的内容，0-9为上文，11-20为下文）：
${contextText}

B、用户的输入：${userQuery}（当前时刻：${currentTimestamp.toFixed(1)}秒）

**输出示例** 
【17】`;

        let insertAtIndex = 10; // Default to line 10 (current line)
        
        try {
            const insertResp = await fetch(`${DOUBAO_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DOUBAO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "doubao-seed-1-6-251015",
                    messages: [
                        {
                            role: "user",
                            content: insertPrompt
                        }
                    ],
                    stream: false
                })
            });
            
            const insertData = await insertResp.json();
            if (insertResp.ok && insertData.choices?.[0]) {
                const responseText = insertData.choices[0].message.content;
                log(`Insert position response: ${responseText}`);
                
                // Extract number from 【编号】 format
                const match = responseText.match(/【(\d+)】/);
                if (match) {
                    insertAtIndex = parseInt(match[1]);
                    log(`Parsed insert index: ${insertAtIndex}`);
                } else {
                    log(`Failed to parse insert index, using default ${insertAtIndex}`);
                }
            } else {
                log(`Insert position API error: ${JSON.stringify(insertData)}`);
            }
        } catch (e: any) {
            log(`Insert position error: ${e.message}, using default ${insertAtIndex}`);
        }

        // Step 2: Generate Script
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

        // Step 3: Generate Audio
        log("Generating audio for both speakers...");
        const [hostAudio, timAudio] = await Promise.all([
            generateT2A(LUO_VOICE_ID, hostText, log),
            generateT2A(TIM_VOICE_ID, timText, log)
        ]);

        if (!hostAudio || !timAudio) {
            throw new Error(`Audio generation failed. Host: ${!!hostAudio}, Guest: ${!!timAudio}`);
        }

        // Step 4: Calculate durations
        log("Calculating accurate duration...");
        const hostSeconds = await getDuration(hostAudio);
        const timSeconds = await getDuration(timAudio);
        
        log(`Accurate durations: Host=${hostSeconds}s, Tim=${timSeconds}s`);

        // Return array of segments, each with its own audio and transcript
        return json({
            insertAtIndex,
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
