# Audio/Voice Input Handling

## Overview

The voice input feature allows users to speak transaction details which are then transcribed and parsed into structured transaction data.

## How It Works

### 1. Audio Recording (Client-Side)

The user records audio using the browser's `MediaRecorder` API:

```typescript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
```

- **Format**: WebM audio format (`.webm`)
- **Storage**: Audio is kept in memory as a Blob (not stored in Supabase)
- **Process**: When recording stops, the audio blob is sent directly to our API

### 2. Transcription (Server-Side - `/api/openai/transcribe`)

The audio is processed in two steps:

#### Step A: Speech-to-Text (Whisper API)

```typescript
// Send audio to OpenAI Whisper API
const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
  body: formData, // Contains the audio file
});

// Response: { text: "I spent 25 dollars on coffee today" }
const transcription = data.text;
```

**What we get**: Plain text transcription of what the user said
- Example: "I spent 25 dollars on coffee today"

#### Step B: Extract Transaction Data (GPT-4)

The transcription is then sent to GPT-4 to extract structured transaction information:

```typescript
const parseResponse = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "Instructions for extracting transaction data...",
      },
      {
        role: "user",
        content: `Extract transaction information from this spoken text: "${transcription}"`,
      },
    ],
    response_format: { type: "json_object" }, // Forces JSON response
  }),
});
```

**What we request**: A JSON object with:
- `amount` (number): Transaction amount
- `description` (string): Brief description
- `category` (string | null): Category if mentioned
- `transaction_date` (string): Date in YYYY-MM-DD format

**Response Format**: Structured JSON object
```json
{
  "amount": 25.00,
  "description": "Coffee and breakfast",
  "category": "Food",
  "transaction_date": "2024-01-15"
}
```

### 3. Data Handling & Validation

The API validates the extracted data:

```typescript
// Parse the JSON response
const transactionJson = JSON.parse(content);

// Validate required fields
if (!transactionJson.amount && !transactionJson.description) {
  return { transcription, transaction: null };
}
```

**Missing Information Handling**:
- **Amount**: If not specified, defaults to `0` (user can edit)
- **Description**: If not specified, defaults to empty string `""` (user can edit)
- **Category**: If not mentioned, set to `null` (optional field)
- **Date**: If not mentioned, defaults to today's date

### 4. User Review & Edit (Client-Side)

The extracted data is displayed in a form where the user can:
- Review the transcription
- Edit any extracted fields
- Select a payment method
- Save the transaction

## Example Flow

**User speaks**: "I bought groceries for 75 dollars yesterday"

1. **Transcription**: "I bought groceries for 75 dollars yesterday"
2. **Extraction**: 
   ```json
   {
     "amount": 75.00,
     "description": "Groceries",
     "category": null,
     "transaction_date": "2024-01-14"  // yesterday
   }
   ```
3. **User reviews**: Form is pre-filled with this data
4. **User edits**: Might add category "Food", select payment method
5. **Save**: Transaction is created in the database

## Error Handling

### Transcription Failures
- If Whisper API fails → Returns error to user
- User can try recording again

### Parsing Failures
- If GPT-4 fails to extract data → Returns transcription only
- User sees the error message and can enter data manually
- The transcription is still shown to help the user

### Missing Fields
- Amount missing → Set to 0, user must edit before saving
- Description missing → Set to empty string, user can add it
- Date missing → Defaults to today, user can change it
- Category missing → Set to null (optional field)

## API Response Format

### Success
```json
{
  "transcription": "I spent 25 dollars on coffee today",
  "transaction": {
    "amount": 25.00,
    "description": "Coffee",
    "category": "Food",
    "transaction_date": "2024-01-15"
  }
}
```

### Partial Success (parsing failed)
```json
{
  "transcription": "I spent 25 dollars on coffee today",
  "transaction": null
}
```

### Error
```json
{
  "error": "Failed to transcribe audio"
}
```

## Security

- ✅ Audio is sent directly to OpenAI (not stored in Supabase)
- ✅ API key is stored server-side only (never exposed to client)
- ✅ Audio blobs are kept in browser memory (not persisted)
- ✅ All processing happens server-side

## Cost Considerations

**OpenAI API Costs**:
- **Whisper API**: ~$0.006 per minute of audio
- **GPT-4**: ~$0.03 per 1K input tokens + $0.06 per 1K output tokens

**Typical transaction**: 
- ~10 seconds of audio = ~$0.001 (Whisper)
- ~200 tokens for parsing = ~$0.01 (GPT-4)
- **Total**: ~$0.01 per transaction

## Future Improvements

1. **Better category matching**: Use embeddings to match spoken categories to existing categories
2. **Multi-transaction support**: Parse "I bought groceries for 75 and gas for 40"
3. **Confidence scores**: Show confidence levels for extracted fields
4. **Voice commands**: "Mark as income", "Set category to Food", etc.
5. **Language support**: Support multiple languages via Whisper
