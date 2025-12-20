import { json } from '@sveltejs/kit';
import { MINIMAX_API_KEY, DOUBAO_API_KEY, DOUBAO_BASE_URL } from '$env/static/private';
import { Buffer } from 'buffer';
import mp3Duration from 'mp3-duration';
import { promisify } from 'util';
import { readFileSync, appendFileSync } from 'fs';
import { join } from 'path';

import type { RequestHandler } from './$types';

// Promisify mp3Duration
const getDuration = promisify(mp3Duration);

// MiniMax T2A V2 API URL
const T2A_V2_URL = "https://api.minimaxi.com/v1/t2a_v2";

// Voice IDs
const LUO_VOICE_ID = "luo_yonghao_clone_v1";
const TIM_VOICE_ID = "tim_clone_v1";

// Load reference documents
const PODCAST_OUTLINE = readFileSync(join(process.cwd(), '播客大纲.txt'), 'utf-8');
const SPEAKER_INFO = readFileSync(join(process.cwd(), '对话人信息.txt'), 'utf-8');
const DIALOGUE_HABITS = readFileSync(join(process.cwd(), '对话习惯.txt'), 'utf-8');

const LOG_FILE = join(process.cwd(), 'api-debug.log');

function writeLog(content: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `\n${'='.repeat(80)}\n[${timestamp}]\n${content}\n`;
    try {
        appendFileSync(LOG_FILE, logEntry, 'utf-8');
    } catch (e) {
        console.error('Failed to write log file:', e);
    }
}

export const POST: RequestHandler = async ({ request }) => {
    const { userQuery, contextBefore, contextAfter } = await request.json();
    
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
        log(`Generating dialogue for: ${userQuery}`);

        // Build context with INSERT HERE marker
        const contextText = `${contextBefore || ''}

[INSERT HERE]

${contextAfter || ''}`;

        // Construct the prompt
        const scriptPrompt = `**角色**
你是一个播客剧本写作大师，擅长理解前后文的关联，根据人物性格，营造播客氛围，撰写剧本台词。你需要让用户沉浸在播客的氛围里面，用户提出问题的时候，你需要在严格按照事实资料的基础上，根据所提供的多角度输入内容，撰写剧本，从而对用户的问题进行解答，解答问题的核心宗旨是在参考播客上下文和前后关系的同时准确地解答问题，时刻保持这个节目的播客氛围。

**输入**
A、上下文（包含：一段对话文本，以及在哪里插入这段话，即[INSERT HERE]标记）
B、用户输入（用户希望嘉宾讨论什么话题）
C、说话人信息（描述了参与谈话的人的身份，性格，常用语气）
D、播客大纲（用于查阅客观信息）

**任务**
现在用户输入了一个希望嘉宾讨论的话题/问题（B用户输入），你需要先了解嘉宾情况（C说话人信息），了解上下文的情况（A上下文），确认插入位置（[INSERT HERE]标记)，接下来开始创作一段对话剧本，对话开始的位置就是插入的位置，如果这个问题和事实确认有关，可以参考播客大纲中的事实（D播客大纲）作为佐证。

**输出**
一份包含说话人和说话内容的Json格式文档。

**输出格式规范** 
{
  "dialogue": [
    {
      "speaker": "罗永浩",
      "content": "content1"
    }, 
    {
      "speaker": "Tim",
      "content": "content2"
    }
  ]
}

**要求**
1、符合人物个性：你写的台词需要符合人设
2、上文关联：需要在语意上连贯，且绝对不许和上文重复。
3、下文关联：下文连贯性，需要考虑和后文的衔接，且绝对不许和后文重复。
4、说话人判断：你需要根据用户输入和上下文来判断这个问题应该由谁回答，也就是由另一个人替观众提问。
5、长度限制：不要让一个人讲述超过4句话。
6、整体长度限制：你创作的总对话长度不应该超过10句话。
7、提问包装：用户的提问往往不适合说话人直接说出，需要你做一些更适合播客场景的润色和处理，以更符合说话人身份的口吻说出。

**注意**
请始终把上下文的语意连贯当作第一优先级！

**引导语使用** 
当你判断上下文无法非常连贯承接时的时候，你可以尝试在第一句使用引导语，常见的引导语举例："诶，刚刚有一个观众提问""我想起来一个问题......""换个话题，我其实一直有一个疑问，我相信很多听众也有这个困惑......"

---

**A、上下文**
${contextText}

**B、用户输入**
${userQuery}

**C、说话人信息**
${SPEAKER_INFO}

**D、播客大纲**
${PODCAST_OUTLINE}

---

请严格按照JSON格式输出对话内容，不要添加任何其他文字说明。`;

        // Log the full prompt for debugging
        log("===== FULL PROMPT TO DOUBAO (DIALOGUE) =====");
        log(scriptPrompt);
        log("===== END OF PROMPT =====");

        log("Calling Doubao API for dialogue generation...");
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
                        role: "user",
                        content: scriptPrompt
                    }
                ],
                thinking: { type: "disabled" },
                stream: false
            })
        });
        
        const chatData = await chatResp.json();
        if (!chatResp.ok || !chatData.choices?.[0]) {
            log(`Doubao Error: ${JSON.stringify(chatData)}`);
            throw new Error("Failed to generate dialogue script");
        }

        const rawResponse = chatData.choices[0].message.content;
        log(`Raw Doubao response: ${rawResponse.substring(0, 200)}...`);

        // Parse JSON response (initial script)
        let initialDialogue: Array<{ speaker: string; content: string }> = [];
        try {
            // Try to extract JSON from markdown code blocks if present
            const jsonMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || rawResponse.match(/(\{[\s\S]*\})/);
            const jsonStr = jsonMatch ? jsonMatch[1] : rawResponse;
            const parsed = JSON.parse(jsonStr);
            initialDialogue = parsed.dialogue || [];
            log(`Parsed ${initialDialogue.length} initial dialogue lines`);
        } catch (e: any) {
            log(`JSON parse error: ${e.message}`);
            throw new Error("Failed to parse dialogue JSON");
        }

        if (initialDialogue.length === 0) {
            throw new Error("No dialogue generated");
        }

        // Step 2: Polish the dialogue with character habits
        log("===== STEP 2: POLISHING DIALOGUE =====");
        const polishPrompt = `**角色** 
你是一个对话文本生成润色大师，擅长理解前后文的关联，根据人物性格，营造播客氛围，写出最适合且贴切的对话内容。你需要严格根据所提供的多角度输入内容，达成对话文本生成的目标。

**输入**
A、上下文（包含：一段对话文本，以及在哪里插入这段话）
E、对话习惯（发起对话和接应对话的角色说话习惯）
F、剧本（对话双方的剧情走向）

**任务** 
现在你得到了对话人的对话习惯（E 对话习惯），你需要了解并记住这个对话人的习惯，然后用他们的对话习惯，在所提供的位置（A 上下文）处，参考所提供的对话剧本（F 剧本），生成对话文本，可以有自己的创作。生成后的文本带回原文，通读全文至通顺，如果不通顺的话带回去重新生成，直至通顺。

**输出** 
一份包含说话人和说话内容的Json格式文档。

**输出格式规范** 
{
  "dialogue": [
    {
      "speaker": "罗永浩",
      "content": "content1"
    }, 
    {
      "speaker": "Tim",
      "content": "content2"
    }
  ]
}

**要求** 
1、符合人物个性：你写的台词需要严格符合所提供的人物个性
2、上文关联：需要在语意上连贯，且绝对不许和上文重复。
3、下文关联：下文连贯性，需要考虑和后文的衔接，且绝对不许和后文重复。
4、说话人判断：你需要根据用户输入和上下文来判断这个问题应该由谁回答，也就是由另一个人替观众提问。
5、长度限制：不要让一个人讲述超过4句话。
6、整体长度限制：你创作的总对话长度不应该超过10句话。
7、问答包装：用户的提问往往不适合说话人直接说出，需要你做一些更贴合说话人说话习惯的润色和处理，以更符合说话人身份的口吻说出。

**注意** 
请始终把上下文的语意连贯当作第一优先级！

---

**A、上下文**
${contextText}

**E、对话习惯**
${DIALOGUE_HABITS}

**F、剧本**
${JSON.stringify(initialDialogue, null, 2)}

---

请严格按照JSON格式输出润色后的对话内容，不要添加任何其他文字说明。`;

        log("===== POLISH PROMPT TO DOUBAO =====");
        log(polishPrompt);
        log("===== END OF POLISH PROMPT =====");

        log("Calling Doubao API for dialogue polishing...");
        const polishResp = await fetch(`${DOUBAO_BASE_URL}/chat/completions`, {
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
                        content: polishPrompt
                    }
                ],
                thinking: { type: "disabled" },
                stream: false
            })
        });
        
        const polishData = await polishResp.json();
        if (!polishResp.ok || !polishData.choices?.[0]) {
            log(`Doubao Polish Error: ${JSON.stringify(polishData)}`);
            log("Falling back to initial dialogue");
            // Fallback to initial dialogue if polish fails
        } else {
            const polishRawResponse = polishData.choices[0].message.content;
            log(`Polish response: ${polishRawResponse.substring(0, 200)}...`);

            try {
                const jsonMatch = polishRawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || polishRawResponse.match(/(\{[\s\S]*\})/);
                const jsonStr = jsonMatch ? jsonMatch[1] : polishRawResponse;
                const parsed = JSON.parse(jsonStr);
                const polishedDialogue = parsed.dialogue || [];
                
                if (polishedDialogue.length > 0) {
                    initialDialogue = polishedDialogue;
                    log(`Successfully polished dialogue with ${polishedDialogue.length} lines`);
                } else {
                    log("Polish returned empty dialogue, using initial");
                }
            } catch (e: any) {
                log(`Polish parse error: ${e.message}, using initial dialogue`);
            }
        }

        // Generate audio for each speaker
        log("Generating audio for polished dialogue...");
        const segments = [];
        
        for (const line of initialDialogue) {
            const voiceId = line.speaker.includes('罗永浩') ? LUO_VOICE_ID : TIM_VOICE_ID;
            const audio = await generateT2A(voiceId, line.content, log);
            
            if (!audio) {
                log(`Warning: Failed to generate audio for ${line.speaker}`);
                continue;
            }
            
            const duration = await getDuration(audio);
            log(`Generated audio for ${line.speaker}: ${duration.toFixed(2)}s`);
            
            segments.push({
                audioUrl: `data:audio/mp3;base64,${audio.toString('base64')}`,
                duration,
                transcript: {
                    speaker: line.speaker.includes('罗永浩') ? "罗永浩 (AI)" : "Tim (AI)",
                    content: line.content,
                    timestamp: "AI-Gen",
                    type: 'generated'
                }
            });
        }

        if (segments.length === 0) {
            throw new Error("No audio segments generated");
        }

        return json({
            segments,
            debugLogs 
        });

    } catch (e: any) {
        log(`CRITICAL ERROR: ${e.message}`);
        return json({ error: e.message, debugLogs }, { status: 500 });
    } finally {
        // Write all logs to file
        writeLog(`[GENERATE DIALOGUE]\n${debugLogs.join('\n')}`);
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
