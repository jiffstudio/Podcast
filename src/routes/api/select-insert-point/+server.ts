import { json } from '@sveltejs/kit';
import { DOUBAO_API_KEY, DOUBAO_BASE_URL } from '$env/static/private';
import type { RequestHandler } from './$types';

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
        log(`Determining insertion point for: ${userQuery}`);
        log(`Current timestamp: ${currentTimestamp}s`);
        log(`Context lines: ${contextLines.length}`);
        
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

        // Log the full prompt for debugging
        log("===== FULL PROMPT TO DOUBAO =====");
        log(insertPrompt);
        log("===== END OF PROMPT =====");

        let insertAtIndex = 10; // Default to line 10 (current line)
        
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
    }
};

