import { json } from '@sveltejs/kit';
import { DOUBAO_API_KEY, DOUBAO_BASE_URL } from '$env/static/private';
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

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
    const { userQuery, currentTimestamp, contextLines, currentIndexInContext } = await request.json();
    
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
        log(`Determining insertion point for: ${userQuery}`);
        log(`Current timestamp: ${currentTimestamp}s`);
        log(`Context lines: ${contextLines.length}`);
        log(`Current index in context: ${currentIndexInContext ?? 'unknown'}`);
        
        const contextText = contextLines.map((line: any) => 
            `${line.index}、【${line.seconds.toFixed(1)}秒】${line.speaker}: ${line.content}`
        ).join('\n');
        
        // Calculate actual current index, default to middle if not provided
        const actualCurrentIndex = currentIndexInContext ?? Math.floor(contextLines.length / 2);
        
        const insertPrompt = `**角色** 
你是一个播客理解大师，擅长理解对话人的语气，非常熟悉对话之间的逻辑。

**任务**
你现在收到了一条用户的输入，和用户输入前后10句上下文。为了给系统加载留出时间，你需要在用户输入的时刻后，至少15秒以后的位置，找到一个适合开启这个话题的地方。

**要求**
1、你只需要返回一个记号，告诉他们在何处开始这个新话题最合适。
2、输出的编号表示插入的位置在某个句子之后。
3、你需要理解语意，你的插入决不能在一个提问之后。
4、你需要理解这个话题是否和上下文有关，如果与上下文有相关，最好不要出现太明显的话题跳跃。
5、请务必找到用户输入时刻至少15秒以后的位置，保证系统有足够的时间准备

**输出**
【编号】

**输入**
A、上下文（按照时间编号，第${actualCurrentIndex}条为用户输入时嘉宾正在说的内容）：
${contextText}

B、用户的输入：${userQuery}（当前时刻：${currentTimestamp.toFixed(1)}秒，当前编号：${actualCurrentIndex}）

**输出示例** 
【17】`;

        // Log the full prompt for debugging
        log("===== FULL PROMPT TO DOUBAO =====");
        log(insertPrompt);
        log("===== END OF PROMPT =====");

        let insertAtIndex = actualCurrentIndex; // Default to current line
        
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
                thinking: { type: "disabled" },
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

        return json({
            insertAtIndex,
            debugLogs
        });

    } catch (e: any) {
        log(`ERROR: ${e.message}`);
        return json({ error: e.message, debugLogs }, { status: 500 });
    } finally {
        // Write all logs to file
        writeLog(`[SELECT INSERT POINT]\n${debugLogs.join('\n')}`);
    }
};

