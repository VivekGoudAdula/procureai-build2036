# ProcureAI Backend Validation & Testing Suite

This repository contains an automated testing suite for the **ProcureAI** backend. It validates API endpoints, business logic, security protections, and transaction lifecycles without requiring external live services.

---

## Testing Strategy

To ensure stability and rapid validation:
* **Escrow State Machine Validation**: Strictly verifies valid transitions (`CREATED` &rarr; `FUNDED` &rarr; `PROOF_UPLOADED` &rarr; `VERIFIED` &rarr; `RELEASED`) and asserts that invalid transitions yield HTTP 409 Conflict.
* **In-Memory Mock Database**: MongoDB collections are backed by in-memory mock fixtures for instant, isolated test execution.
* **Isolated Environment**: External network integrations (SMTP, Alibaba RapidAPI, Groq) are cleanly mocked.

---

## How to Run Tests

### Prerequisites
Install test dependencies from `backend/requirements.txt`:
```bash
pip install -r backend/requirements.txt
```

### Running the Suite
Run tests from the project root:
```bash
python -m pytest tests/ --no-cov
```

---

## Test Suites

The test suite covers:
- `tests/test_auth.py`: User registration, login, JWT issuance and expiration
- `tests/test_escrow.py`: Simulated escrow state machine lifecycle and transition rules
- `tests/test_escrow_edge.py`: Double-release prevention, missing records, invalid transitions
- `tests/test_security_hardening.py`: File upload MIME validation, auth protection, rate limiting
- `tests/test_supplier_selection.py`: Sourcing scoring, criteria filtering, and recommendation
- `tests/test_end_to_end_procurement_flow.py`: Full multi-step procurement workflow
