import type { AiInteractionRequest, AiInteractionResponse, InsertPointResponse } from './types';

export async function selectInsertPoint(req: AiInteractionRequest): Promise<InsertPointResponse> {
    console.log("[API] Selecting insertion point...");
    const startTime = Date.now();
    
    try {
        const response = await fetch('/api/select-insert-point', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userQuery: req.userQuery,
                currentTimestamp: req.currentTimestamp,
                contextLines: req.contextLines
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const logStr = errData.debugLogs ? "\n\nDebug Logs:\n" + errData.debugLogs.join("\n") : "";
            throw new Error(`API Error: ${response.statusText} ${errData.error || ""}${logStr}`);
        }

        const data: InsertPointResponse = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`[API] Insert point selected in ${elapsed}ms:`, data.insertAtIndex);
        return data;
        
    } catch (e) {
        console.error("Failed to select insert point:", e);
        throw e;
    }
}

export async function generateAIContent(userQuery: string, contextBefore?: string, contextAfter?: string): Promise<AiInteractionResponse> {
    console.log("[API] Generating AI content...");
    const startTime = Date.now();
    
    try {
        const response = await fetch('/api/interact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userQuery,
                contextBefore,
                contextAfter
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const logStr = errData.debugLogs ? "\n\nDebug Logs:\n" + errData.debugLogs.join("\n") : "";
            throw new Error(`API Error: ${response.statusText} ${errData.error || ""}${logStr}`);
        }

        const data: AiInteractionResponse = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`[API] AI content generated in ${elapsed}ms:`, data.segments.length, 'segments');
        return data;
        
    } catch (e) {
        console.error("Failed to generate AI content:", e);
        throw e;
    }
}

// Deprecated - kept for backward compatibility
export async function handleUserQuery(req: AiInteractionRequest): Promise<AiInteractionResponse & { insertAtIndex: number }> {
    const insertPointResult = await selectInsertPoint(req);
    const contentResult = await generateAIContent(req.userQuery);
    
    return {
        insertAtIndex: insertPointResult.insertAtIndex,
        ...contentResult
    };
}
