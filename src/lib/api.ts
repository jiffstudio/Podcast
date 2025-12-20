import type { AiInteractionRequest, AiInteractionResponse } from './types';

export async function handleUserQuery(req: AiInteractionRequest): Promise<AiInteractionResponse> {
    console.log("Sending query to backend:", req.userQuery);
    
    try {
        const response = await fetch('/api/interact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userQuery: req.userQuery,
                currentTimestamp: req.currentTimestamp
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data: AiInteractionResponse = await response.json();
        return data;
        
    } catch (e) {
        console.error("Failed to generate interaction:", e);
        throw e;
    }
}

// Deprecated functions below (kept for reference if needed, but unused)
export async function analyzeContextAndFindInsertionPoint(query: string, currentContext: any) { return { insertionPoint: 0, reason: "" } }
export async function generateScript(query: string, insertionPoint: number, context: any) { return { script: [] } }
export async function generateAudio(script: any[]) { return { audioUrl: "", duration: 0 } }
