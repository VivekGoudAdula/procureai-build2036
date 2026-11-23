#!/usr/bin/env python3
"""
Test Data Hygiene Script: purge_test_data.py

Scans escrows, RFQs, ratings, and chat messages in MongoDB.
Identifies test records not owned by a specified email or older than a given date.

SAFETY RULES:
- DRY-RUN by default! No records will be deleted unless --apply is explicitly specified.
- Prints exact counts of matched records before taking any action.
- Does NOT delete administrative accounts or system collections.

Usage:
  python purge_test_data.py --email user@example.com
  python purge_test_data.py --email user@example.com --apply
  python purge_test_data.py --older-than 2026-05-01
  python purge_test_data.py --older-than 2026-05-01 --apply
"""

import os
import sys
import argparse
from datetime import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from database.db import (
        escrows_collection,
        rfqs_collection,
        supplier_ratings_collection,
        chat_messages_collection,
    )
except ImportError as err:
    print(f"Error importing database module: {err}")
    sys.exit(1)


def build_filter(email: str | None, older_than: str | None) -> dict:
    """Builds a MongoDB filter query matching records to purge."""
    conditions = []

    if email:
        conditions.append({"buyer_id": {"$ne": email}})

    if older_than:
        conditions.append({
            "$or": [
                {"created_at": {"$lt": older_than}},
                {"timestamp": {"$lt": older_than}},
            ]
        })

    if not conditions:
        return {}
    if len(conditions) == 1:
        return conditions[0]
    return {"$or": conditions}


def scan_and_purge(email: str | None, older_than: str | None, apply_deletion: bool):
    """Scans collections and conditionally removes matched test data."""
    query = build_filter(email, older_than)
    if not query:
        print("[Purge Script] Please specify either --email or --older-than.")
        return

    print("=" * 60)
    print("TEST DATA HYGIENE SCAN")
    print(f"Mode: {'*** APPLY (DELETION ENABLED) ***' if apply_deletion else 'DRY RUN (NO DATA MODIFIED)'}")
    if email:
        print(f"Target Keep Email: {email} (records not owned by this email will be flagged)")
    if older_than:
        print(f"Older Than Date: {older_than}")
    print("=" * 60)

    # 1. Escrows
    escrows_count = escrows_collection.count_documents(query)
    # 2. RFQs
    rfqs_count = rfqs_collection.count_documents(query)
    # 3. Ratings
    ratings_count = supplier_ratings_collection.count_documents(query)
    # 4. Chat Messages
    chats_count = chat_messages_collection.count_documents(query)

    print(f"Matched records to purge:")
    print(f"  - Escrows:        {escrows_count}")
    print(f"  - RFQs:           {rfqs_count}")
    print(f"  - Ratings:        {ratings_count}")
    print(f"  - Chat Messages:  {chats_count}")
    print(f"  Total Flagged:    {escrows_count + rfqs_count + ratings_count + chats_count}")
    print("-" * 60)

    if not apply_deletion:
        print("[DRY RUN COMPLETE] No records were deleted. Run with --apply to execute deletion.")
        return

    # Execute deletion
    deleted_escrows = escrows_collection.delete_many(query).deleted_count
    deleted_rfqs = rfqs_collection.delete_many(query).deleted_count
    deleted_ratings = supplier_ratings_collection.delete_many(query).deleted_count
    deleted_chats = chat_messages_collection.delete_many(query).deleted_count

    print(f"Successfully purged:")
    print(f"  - Escrows deleted:       {deleted_escrows}")
    print(f"  - RFQs deleted:          {deleted_rfqs}")
    print(f"  - Ratings deleted:       {deleted_ratings}")
    print(f"  - Chat Messages deleted: {deleted_chats}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge unowned or expired test data from database.")
    parser.add_argument("--email", type=str, help="Primary email to keep; records not belonging to this email will be flagged.")
    parser.add_argument("--older-than", type=str, help="ISO date string (YYYY-MM-DD); records created prior will be flagged.")
    parser.add_argument("--apply", action="store_true", default=False, help="Explicitly execute deletion. If omitted, runs in dry-run mode.")

    args = parser.parse_args()
    scan_and_purge(email=args.email, older_than=args.older_than, apply_deletion=args.apply)
