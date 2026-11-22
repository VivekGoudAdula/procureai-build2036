# ProcureAI Deployment Guide

This document outlines the step-by-step instructions to deploy ProcureAI into production environments.

---

## Deployment Architecture Overview

**Production Deployment Architecture:**

```mermaid
graph TB
    subgraph "Frontend Layer"
        Vercel[Vercel Deployment<br/>React + Vite + Tailwind]
    end
    
    subgraph "Backend Layer"
        Render[Render Web Service<br/>FastAPI + Uvicorn]
    end
    
    subgraph "Database Layer"
        Atlas[MongoDB Atlas<br/>Cloud Database]
    end
    
    subgraph "External Services"
        Groq[Groq AI API<br/>Llama-3 Models]
        Alibaba[Alibaba Supplier APIs]
        SMTP[Email Gateway]
    end
    
    Vercel --> Render
    Render --> Atlas
    Render --> Groq
    Render --> Alibaba
    Render --> SMTP
    
    style Vercel fill:#e3f2fd
    style Render fill:#e8f5e9
    style Atlas fill:#fff9c4
```

**Development Environment:**
- Frontend: `npm run dev` (Vite dev server)
- Backend: `uvicorn main:app --reload`

**Production Environment:**
- Frontend: Vercel deployment
- Backend: Containerized FastAPI on Render
- Database: MongoDB Atlas
- Escrow: Milestone-based simulated state machine with audit logs (Payment gateway integration in progress)

* **Frontend**: React + Vite + Tailwind CSS deployed on **Vercel**.
* **Backend**: FastAPI (Python) web server deployed on **Render** (via Web Service).
* **Database**: MongoDB database hosted on **MongoDB Atlas** (Cloud Database).

---

## Environment Variables Reference

To successfully launch the services, the following environment variables must be defined:

| Service | Environment Variable | Purpose | Example Value / Source |
|---|---|---|---|
| **AI Sourcing** | `GROQ_API_KEY` | Connects Groq Llama-3 agent for supplier negotiations | Get from [Groq Console](https://console.groq.com/) |
| **Sourcing API** | `RAPIDAPI_KEY` | Alibaba sourcing search integration API key | Get from [RapidAPI](https://rapidapi.com/) |
| **Sourcing API** | `RAPIDAPI_HOST` | Alibaba sourcing search host domain | `alibaba-datahub.p.rapidapi.com` |
| **Database** | `MONGO_URI` | MongoDB Connection String URL | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/procure_ai` |
| **Database** | `MONGO_DB_NAME` | Name of the MongoDB database | `procure_ai` |
| **Security** | `JWT_SECRET_KEY` | Secret key for signing JWT authentication tokens | Strong random 256-bit string |
| **Security** | `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `https://your-frontend.vercel.app` |
| **Mail Server** | `SMTP_EMAIL` | Credentials for sending RFQ notifications to suppliers | e.g. `your-email@gmail.com` |
| **Mail Server** | `SMTP_PASSWORD` | App-specific password for SMTP server authorization | Google App Password |
| **Mail Server (Optional)** | `EMAIL_DRY_RUN` | Force dry-run mode without sending real emails | `true` or `false` |
| **Mail Server (Optional)** | `EMAIL_OVERRIDE_TO` | Redirect all outgoing emails to a test inbox | `staging@example.com` |

---

## Deployment Instructions

### 1. Database Setup: MongoDB Atlas
1. Create a free-tier cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user with read/write privileges.
3. Whitelist access from all IPs (`0.0.0.0/0`) since Render web service IPs change dynamically.
4. Copy the connection string (with your username and password) and set it as `MONGO_URI`.

### 2. Backend Setup: Render Web Service
1. Create a new **Web Service** on [Render](https://render.com/).
2. Connect your Git repository.
3. Configure the build parameters:
   * **Runtime**: `Python`
   * **Build Command**: `pip install -r backend/requirements.txt`
   * **Start Command**: `python backend/main.py`
4. Add all environment variables listed in the reference table under the Render settings page.

> [!TIP]
> Ensure Render's health check is pointing to the `/health` endpoint to monitor liveness.

### 3. Frontend Setup: Vercel Deployment
1. Import your frontend repository into [Vercel](https://vercel.com/).
2. Set the root directory to `frontend`.
3. Set the build command: `npm run build` and output directory: `dist`.
4. Configure `VITE_API_BASE_URL` with your Render backend URL.
