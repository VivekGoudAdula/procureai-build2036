# ProcureAI Security Documentation

This document describes security policies, access controls, and security implementations for ProcureAI.

---

## Security Features Overview

ProcureAI implements security measures across all layers:

```mermaid
graph TB
    subgraph "Security Layers"
        AUTH[JWT Authentication<br/>+ Bcrypt Password Hashing]
        RATE[Rate Limiting<br/>+ Brute-Force Protection]
        CORS[CORS Configuration<br/>+ Origin Validation]
        FILE[File Upload Validation<br/>+ MIME Type Checking]
        ENV[Environment Variable<br/>+ Secret Management]
        ESCROW[Escrow State Validation<br/>+ 409 Conflict Protection]
        AUDIT[Audit Logging<br/>+ Transaction Tracking]
    end
    
    subgraph "Protected Components"
        API[FastAPI Backend]
        DB[MongoDB Atlas]
        STORAGE[Invoice Storage]
    end
    
    AUTH --> API
    RATE --> API
    CORS --> API
    FILE --> API
    FILE --> STORAGE
    ENV --> API
    ENV --> DB
    ESCROW --> API
    AUDIT --> API
    AUDIT --> DB
    
    style AUTH fill:#e3f2fd
    style RATE fill:#e8f5e9
    style CORS fill:#fff9c4
    style FILE fill:#fce4ec
    style ENV fill:#f3e5f5
    style ESCROW fill:#ffe0b2
    style AUDIT fill:#e1f5fe
```

---

## Current Security Implementations

### 1. Password Hashing (Bcrypt)
Passwords are encrypted using bcrypt before storage.
* **Algorithm**: Blowfish-based key derivation with dynamic salt.
* **Storage**: Plaintext passwords are never stored. Login credentials are checked against bcrypt hashes.

### 2. JWT Authentication
ProcureAI uses JWT authentication for backend security.
* **Token Structure**: Tokens include 30-minute expiration and user identifier.
* **Validation**: FastAPI validates signatures and expirations for protected routes.
* **Fail-fast Startup**: The server strictly requires `JWT_SECRET_KEY` and refuses to start with fallback defaults.

### 3. Rate Limiting
Rate limits prevent brute-force and DoS attacks.
* **Mechanism**: Uses `slowapi` to track clients by IP.
* **Limits**:
  * **Auth**: `/api/login` and `/api/signup` limited to `5 requests/minute`.
  * **API**: Escrow and supplier routes capped at `20-30 requests/minute`.

### 4. File Upload Validation
File uploads are sanitized to prevent exploits.
* **MIME Check**: Only `image/png`, `image/jpeg`, and `application/pdf` allowed.
* **Extension Check**: Only `.jpg`, `.jpeg`, `.png`, and `.pdf` accepted.
* **Sanitization**: Filenames are remapped using `escrow_id` and timestamps.

### 5. CORS Configuration
Backend access is restricted to trusted origins.
* **Allowed Origins**: Set via `ALLOWED_ORIGINS` environment variable.
* **Credentials**: Disabled by default unless explicitly enabled.

### 6. Environment Variables
Keys and secrets are separated from code.
* **Database**: MongoDB URIs managed via environment variables.
* **Git**: `.gitignore` prevents `.env` files from being committed.

### 7. Escrow State Machine Integrity
* Enforces strict status transitions (`CREATED` &rarr; `FUNDED` &rarr; `PROOF_UPLOADED` &rarr; `VERIFIED` &rarr; `RELEASED`).
* Any out-of-sequence attempt returns HTTP 409 Conflict.
* Funds cannot be released before proof of delivery is verified.

### 8. Audit Logging
Tracks all critical operations:
* **User Actions**: Login, signup, procurement, escrow management
* **State Changes**: Escrow state transitions, verified delivery proofs, settlements
* **Security Events**: Failed auth, rate limit violations, suspicious activity
* **Logs**: Append-only with timestamps, actor IDs, and notes.

---

## Future Security Plans

Planned security improvements:

### 1. Role-Based Access Control (RBAC)
* **Plan**: Define user scopes (buyer, supplier, admin).
* **Details**: Check JWT scopes to restrict critical endpoints.

### 2. Multi-Factor Authentication (MFA)
* **Plan**: Optional MFA for high-value transactions
* **Details**: TOTP or hardware key support for escrow releases

### 3. Real-time Threat Detection
* **Plan**: Anomaly detection and automated response
* **Details**: Pattern recognition for unusual transactions and behavior
