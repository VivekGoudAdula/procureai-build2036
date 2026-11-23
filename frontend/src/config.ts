const envUrl = (import.meta as any).env?.VITE_API_URL;
export const API_BASE_URL = (envUrl && envUrl.trim() ? envUrl.trim() : "http://localhost:8000").replace(/\/$/, "");

if (typeof window !== "undefined") {
  if (API_BASE_URL.includes("localhost") && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    console.warn(
      `[ProcureAI Configuration Warning] VITE_API_URL is pointing to "${API_BASE_URL}" on deployed domain (${window.location.origin}). Requests will fail with Axios Network Error. Set VITE_API_URL in Vercel Settings -> Environment Variables to your Render backend URL, then redeploy.`
    );
  } else {
    console.log(`[ProcureAI] API Base URL: ${API_BASE_URL}`);
  }
}
