# ProcureAI Database Design

---

## Architecture Context

ProcureAI uses MongoDB Atlas as the database. It connects to multiple service layers:

```mermaid
graph TB
    UI[React Frontend]
    API[FastAPI Backend]
    DB[(MongoDB Atlas)]
    AI[AI Procurement Engine]
    ESC[Escrow State Machine]

    UI --> API
    API --> DB
    API --> AI
    API --> ESC
    ESC --> DB

    style UI fill:#e3f2fd
    style API fill:#e8f5e9
    style DB fill:#fff9c4
    style AI fill:#f3e5f5
    style ESC fill:#fce4ec
```

---

## Section 1: Database Overview

ProcureAI uses MongoDB Atlas as its primary database, providing a flexible NoSQL schema that scales with the platform's growth. The database stores user authentication records, supplier registry entries, procurement transactions, simulated escrow lifecycles with full audit logs, and supplier ratings.

---

## Section 2: Collection Schema Definitions

### User

```json
{
  "_id": "ObjectId",
  "user_id": "UUID (Primary Key)",
  "name": "String",
  "email": "String (Unique)",
  "password_hash": "String (bcrypt)",
  "role": "String (buyer/supplier/admin)",
  "created_at": "DateTime"
}
```

### Supplier

```json
{
  "_id": "ObjectId",
  "supplier_id": "String (Primary Key)",
  "supplier_name": "String",
  "country": "String",
  "category": "String",
  "reliability_score": "Float (0-100)",
  "response_rate": "Float (0-100)",
  "rating": "Float (0-5)",
  "created_at": "DateTime"
}
```

### ProcurementTransaction

```json
{
  "_id": "ObjectId",
  "transaction_id": "String (Primary Key)",
  "buyer_id": "String (Foreign Key -> users)",
  "supplier_id": "String (Foreign Key -> suppliers)",
  "product_name": "String",
  "quantity": "Integer",
  "status": "String (draft/negotiating/confirmed/in_transit/completed/cancelled)",
  "escrow_id": "String (Foreign Key -> escrows)",
  "created_at": "DateTime"
}
```

### Escrow

```json
{
  "_id": "ObjectId",
  "escrow_id": "String (Primary Key)",
  "transaction_id": "String (Unique)",
  "buyer_id": "String",
  "supplier_id": "String",
  "amount_inr": "Float",
  "provider": "simulated",
  "status": "String (CREATED/FUNDED/PROOF_UPLOADED/VERIFIED/RELEASED/CANCELLED/REFUNDED)",
  "promised_delivery_days": "Integer",
  "verified": "Boolean",
  "delivery_proof": "Object (type, value, file_path, submitted_at)",
  "history": [
    {
      "status": "String",
      "timestamp": "ISO DateTime",
      "actor": "String",
      "note": "String"
    }
  ],
  "created_at": "DateTime",
  "updated_at": "DateTime"
}
```

### SupplierRating

```json
{
  "_id": "ObjectId",
  "rating_id": "UUID (Primary Key)",
  "supplier_id": "String (Foreign Key -> suppliers)",
  "buyer_id": "String (Foreign Key -> users)",
  "rating": "Integer (1-5)",
  "review": "String",
  "created_at": "DateTime"
}
```

### AuditLog

```json
{
  "_id": "ObjectId",
  "log_id": "UUID (Primary Key)",
  "user_id": "String (Foreign Key -> users)",
  "action": "String",
  "module": "String",
  "entity_type": "String",
  "entity_id": "String",
  "details": "Object",
  "timestamp": "DateTime"
}
```

---

## Section 3: Collection Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ PROCUREMENT_TRANSACTION : creates
    SUPPLIER ||--o{ PROCUREMENT_TRANSACTION : receives
    PROCUREMENT_TRANSACTION ||--|| ESCROW : secured_by
    USER ||--o{ SUPPLIER_RATING : submits
    SUPPLIER ||--o{ SUPPLIER_RATING : receives
    USER ||--o{ AUDIT_LOG : generates

    USER {
        string user_id PK
        string name
        string email UK
        string password_hash
        string role
        datetime created_at
    }

    SUPPLIER {
        string supplier_id PK
        string supplier_name
        string country
        string category
        float reliability_score
        float response_rate
        float rating
        datetime created_at
    }

    PROCUREMENT_TRANSACTION {
        string transaction_id PK
        string buyer_id FK
        string supplier_id FK
        string product_name
        integer quantity
        string status
        string escrow_id FK
        datetime created_at
    }

    ESCROW {
        string escrow_id PK
        string transaction_id FK
        string buyer_id
        string supplier_id
        float amount_inr
        string provider
        string status
        boolean verified
        array history
        datetime created_at
    }

    SUPPLIER_RATING {
        UUID rating_id PK
        string supplier_id FK
        string buyer_id FK
        integer rating
        string review
        datetime created_at
    }

    AUDIT_LOG {
        UUID log_id PK
        string user_id FK
        string action
        string entity_type
        string entity_id
        datetime timestamp
    }
```

---

## Section 4: Scalability Notes

### MongoDB Indexing Strategy
- **Unique Indexes**: `users.email`, `escrows.transaction_id`, `escrows.escrow_id`
- **Compound Indexes**: `procurement_transactions.buyer_id + status`, `escrows.status + updated_at`
- **TTL Indexes**: `audit_logs.timestamp` for automatic retention

### Escrow State Machine Storage
- Escrow records contain an audit `history` array recording every transition, timestamp, actor, and note.
- Future payment gateway integrations (e.g. Razorpay / Cashfree test mode) will populate `provider_reference_id` alongside the simulated state machine.
