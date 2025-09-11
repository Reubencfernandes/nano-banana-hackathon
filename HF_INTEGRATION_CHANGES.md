# Hugging Face + fal.ai Integration Changes

This document outlines all the changes made to integrate Hugging Face authentication and fal.ai Gemini 2.5 Flash Image processing.

## Files Modified:

### 1. `/app/page.tsx` - Main Application
**Changes Made:**
- Added HF authentication state management
- Added OAuth login/logout functionality  
- Modified all processing functions to use HF API when logged in
- Updated UI to show HF Pro status
- Removed Google Gemini API token input field

**Key Code Sections to Review:**

#### State Management (around line 847-849):
```typescript
const [isHfProLoggedIn, setIsHfProLoggedIn] = useState(false);
const [isCheckingAuth, setIsCheckingAuth] = useState(true);
```

#### OAuth Authentication Check (around line 772-798):
```typescript
useEffect(() => {
  (async () => {
    setIsCheckingAuth(true);
    try {
      // Handle OAuth redirect if present
      const oauth = await oauthHandleRedirectIfPresent();
      if (oauth) {
        // Store the token server-side
        await fetch('/api/auth/callback', {
          method: 'POST',
          body: JSON.stringify({ hf_token: oauth.accessToken }),
          headers: { 'Content-Type': 'application/json' }
        });
        setIsHfProLoggedIn(true);
      } else {
        // Check if already logged in
        const response = await fetch('/api/auth/callback', { method: 'GET' });
        if (response.ok) {
          const data = await response.json();
          setIsHfProLoggedIn(data.isLoggedIn);
        }
      }
    } catch (error) {
      console.error('OAuth error:', error);
    } finally {
      setIsCheckingAuth(false);
    }
  })();
}, []);
```

#### HF Pro Login Handler (around line 801-824):
```typescript
const handleHfProLogin = async () => {
  if (isHfProLoggedIn) {
    // Logout: clear the token
    try {
      await fetch('/api/auth/callback', { method: 'DELETE' });
      setIsHfProLoggedIn(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  } else {
    // Login with HF OAuth
    const clientId = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID;
    if (!clientId) {
      console.error('OAuth client ID not configured');
      alert('OAuth client ID not configured. Please check environment variables.');
      return;
    }
    
    window.location.href = await oauthLoginUrl({
      clientId,
      redirectUrl: `${window.location.origin}/api/auth/callback`
    });
  }
};
```

#### Processing Functions Modified:
- `processNode()` (around line 1281-1287): Added HF Pro requirement check
- `executeMerge()` (around line 1455): Uses `/api/hf-process` endpoint
- `runMerge()` (around line 1528-1531): Added HF Pro requirement check

#### UI Changes (around line 1763-1789):
- Removed API token input field
- Added HF Pro login button
- Added status indicator for fal.ai usage

### 2. `/app/api/hf-process/route.ts` - New HF Processing Endpoint
**Purpose:** Handles image processing using HF token authentication and fal.ai models

**Key Features:**
- Authenticates using HF token from cookies
- Uses `fal-ai/gemini-25-flash-image/edit` model
- Handles both MERGE and single image processing
- Converts images to/from base64 and Blob formats

**Main Function Structure:**
```typescript
export async function POST(req: NextRequest) {
  // 1. Check HF authentication
  const cookieStore = await cookies();
  const hfToken = cookieStore.get('hf_token');
  
  // 2. Initialize HF Inference client
  const hf = new HfInference(hfToken.value);
  
  // 3. Handle MERGE operations
  if (body.type === "MERGE") {
    const result = await hf.textToImage({
      model: "fal-ai/gemini-25-flash-image/edit",
      inputs: prompt,
      parameters: { width: 1024, height: 1024, num_inference_steps: 20 }
    });
  }
  
  // 4. Handle single image processing
  const result = await hf.imageToImage({
    model: "fal-ai/gemini-25-flash-image/edit",
    inputs: inputBlob,
    parameters: { prompt: prompt, strength: 0.8, num_inference_steps: 25 }
  });
}
```

### 3. `/app/api/auth/callback/route.ts` - OAuth Callback Handler
**Purpose:** Handles HF OAuth callbacks and token storage

**Key Functions:**
- `GET`: Handles OAuth redirects and auth status checks
- `POST`: Stores HF tokens in HTTP-only cookies  
- `DELETE`: Logout functionality (clears cookies)

**Cookie Security:**
```typescript
cookieStore.set({
  name: 'hf_token',
  value: hf_token,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30 // 30 days
});
```

### 4. Package Dependencies Added:
- `@huggingface/hub`: OAuth functionality
- `@huggingface/inference`: API client for fal.ai models

## Environment Variables Required:
```
OAUTH_CLIENT_ID=778cfe88-b732-4803-9734-87b0c42f080b
NEXT_PUBLIC_OAUTH_CLIENT_ID=778cfe88-b732-4803-9734-87b0c42f080b
OAUTH_CLIENT_SECRET=4b037e96-e4df-491e-a2f3-8d633c7d566d
```

## OAuth Configuration Required:
In Hugging Face OAuth app settings, add redirect URI:
- `https://banana-hackathon.vercel.app/api/auth/callback`
- `http://localhost:3000/api/auth/callback` (for local development)

## How It Works:
1. User clicks "Login HF PRO" button
2. Redirects to Hugging Face OAuth
3. User authorizes the app
4. Returns to `/api/auth/callback` with authorization code
5. Client-side code exchanges code for token
6. Token stored in HTTP-only cookie
7. All subsequent API calls to `/api/hf-process` use the stored token
8. Processing happens via fal.ai's Gemini 2.5 Flash Image models

## Current Status (COMMENTED OUT FOR MANUAL REVIEW):
- ✅ All HF + fal.ai integration code has been commented out
- ✅ Original Google Gemini API functionality restored
- ✅ App works with original API token input system
- ✅ All HF integration code preserved in comments for manual review
- ✅ Build successful with commented code

## To Activate HF + fal.ai Integration:
1. **Uncomment the imports**: Restore the HF OAuth import at the top of `app/page.tsx`
2. **Uncomment state management**: Restore the HF authentication state variables  
3. **Uncomment OAuth useEffect**: Restore the OAuth redirect handling logic
4. **Uncomment login handler**: Restore the `handleHfProLogin` function
5. **Uncomment processing logic**: Restore the calls to `/api/hf-process` endpoint
6. **Uncomment UI elements**: Restore the HF Pro login button and status indicators
7. **Configure OAuth redirect URIs** in HF settings
8. **Set environment variables** in deployment
9. **Deploy to test** on HTTPS domain

## Files with Commented HF Integration:
- `/app/page.tsx` - All HF authentication and processing logic commented
- `/app/api/hf-process/route.ts` - Ready to use (no changes needed)  
- `/app/api/auth/callback/route.ts` - Ready to use (no changes needed)

## Original Functionality:
- ✅ Google Gemini API token input restored
- ✅ All original processing endpoints working
- ✅ Original help documentation restored
- ✅ App functions exactly as before HF integration