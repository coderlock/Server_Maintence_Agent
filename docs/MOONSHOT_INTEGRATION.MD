# Moonshot AI Integration Notes

### As of phase 4 the Moonshot integration is not working, switched to openai ###

## Overview
The MVP will use **Moonshot's Kimi 2.5** model instead of Anthropic's Claude for the AI assistant features.

---

## Configuration

### API Key
- **Environment Variable:** `MOONSHOT_API_KEY`
- **Location:** `.env.local` (already configured)
- **Value:** `sk-xxx`

### Model Settings (in settings.ts)
```typescript
{
  aiProvider: 'moonshot',
  aiModel: 'moonshot-v1-128k',
  aiTemperature: 0.7,
  aiMaxTokens: 4096
}
```

---

## Moonshot API Reference

### Base URL
```
https://api.moonshot.cn/v1
```

### Available Models
- **moonshot-v1-8k** - Fast responses, 8K context
- **moonshot-v1-32k** - Balanced, 32K context
- **moonshot-v1-128k** - Maximum context (chosen for MVP)

### API Format
Moonshot uses an OpenAI-compatible API format:

```javascript
POST /v1/chat/completions
Headers:
  Authorization: Bearer {MOONSHOT_API_KEY}
  Content-Type: application/json

Body:
{
  "model": "moonshot-v1-128k",
  "messages": [
    {"role": "system", "content": "You are an AI assistant..."},
    {"role": "user", "content": "User message"}
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": true  // For streaming responses
}
```

---

## Implementation Plan for Sprint 4

### 1. Install Moonshot SDK
```bash
npm install moonshot-ai
# OR use OpenAI SDK (compatible)
npm install openai
```

### 2. Create AI Service (`src/main/services/ai/MoonshotService.ts`)
```typescript
import OpenAI from 'openai';

export class MoonshotService {
  private client: OpenAI;
  
  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.moonshot.cn/v1',
    });
  }
  
  async sendMessage(messages, options) {
    const stream = await this.client.chat.completions.create({
      model: 'moonshot-v1-128k',
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4096,
      stream: true,
    });
    
    for await (const chunk of stream) {
      yield chunk.choices[0]?.delta?.content || '';
    }
  }
}
```

### 3. Context Building for Server Maintenance
Include in system message:
```typescript
const systemPrompt = `You are a server maintenance AI assistant.
Connected to: ${osInfo.type} ${osInfo.distro || ''} ${osInfo.version || ''}
Hostname: ${osInfo.hostname}
Mode: ${mode} // 'fixer' or 'teacher'

In Fixer mode:
- Generate executable command plans
- Mark dangerous commands for approval
- Auto-execute safe commands

In Teacher mode:
- Explain each command
- Provide educational context
- Don't auto-execute (user copies commands)

Current system info:
- OS: ${osInfo.type}
- Distribution: ${osInfo.distro}
- Kernel: ${osInfo.kernel}
`;
```

---

## Rate Limits & Pricing

### Kimi 2.5 (moonshot-v1-128k)
- **Context:** 128K tokens
- **Rate Limit:** Check Moonshot dashboard
- **Pricing:** ~¥0.012/1K tokens (input), ~¥0.012/1K tokens (output)

### Best Practices
1. Stream responses for better UX
2. Limit context to recent messages + system info
3. Implement retry logic for rate limits
4. Cache system detection results

---

## Testing

### Test Connection (Sprint 4)
```typescript
// Quick test in settings handler
const testMoonshot = async () => {
  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MOONSHOT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'moonshot-v1-128k',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 10,
    }),
  });
  return response.ok;
};
```

---

## Migration from Anthropic

### Changes Made
1. ✅ Updated `settings.ts` default provider to 'moonshot'
2. ✅ Changed default model to 'moonshot-v1-128k'
3. ✅ Updated settings handler to read `MOONSHOT_API_KEY`
4. ✅ Updated `.env.local.template`

### Next Steps (Sprint 4)
1. Remove `@anthropic-ai/sdk` dependency
2. Install Moonshot-compatible SDK
3. Implement `MoonshotService.ts`
4. Update AI IPC handlers
5. Test streaming responses
6. Implement plan generation with Kimi

---

## Resources

- **Moonshot AI Console:** https://platform.moonshot.cn/console
- **API Documentation:** https://platform.moonshot.cn/docs
- **Model Comparison:** https://platform.moonshot.cn/docs/intro
- **OpenAI Compatibility:** Uses OpenAI SDK format

---

**Status:** Configuration complete, implementation scheduled for Sprint 4
**Last Updated:** February 13, 2026
