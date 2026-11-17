# OpenChess Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched in `/databases/{database}/documents` are denied for both `read` and `write`.
2. **Verified Google Identity**: Every write operation requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **Owner Integrity**: A `/users/{userId}` document can only be created or updated by `request.auth.uid == userId`, and `incoming().ownerId == request.auth.uid`.
4. **Split Collection PII Isolation**: User email addresses (PII) are never stored on `/users/{userId}` public documents. They are isolated inside `/users/{userId}/private/{docId}`, where both `get` and `write` are strictly limited to `isOwner(userId)` and `docId == 'account'`.
5. **Master Gate on Subcollection**: Creating or updating `/users/{userId}/private/{docId}` requires the parent `/users/{userId}` document to exist (`exists(...)` or `existsAfter(...)`) and belong to `request.auth.uid`.
6. **Strict Schema & Immutability**: `ownerId` and `createdAt` are immutable across updates (`incoming().ownerId == existing().ownerId` and `incoming().createdAt == existing().createdAt`). Timestamps `createdAt` (on create) and `updatedAt` (on create/update) must equal `request.time`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` writing to `/users/user_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'user_1', token: { email_verified: false } }` writing to `/users/user_1` -> `PERMISSION_DENIED`.
3. **Cross-User Identity Spoofing**: `auth.uid = 'attacker'` creating `/users/victim` -> `PERMISSION_DENIED`.
4. **Mismatched ownerId Field**: `auth.uid = 'user_1'` creating `/users/user_1` with `ownerId: 'user_2'` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: Creating `/users/user_1` with an undeclared field `isAdmin: true` -> `PERMISSION_DENIED`.
6. **PII Leak Read on Private Subcollection**: `auth.uid = 'other_user'` reading `/users/user_1/private/account` -> `PERMISSION_DENIED`.
7. **Orphaned Private Subcollection Write**: `auth.uid = 'user_1'` creating `/users/user_1/private/account` when `/users/user_1` does not exist -> `PERMISSION_DENIED`.
8. **Immutable Field Tampering (`createdAt`)**: Updating `/users/user_1` with a modified `createdAt` timestamp -> `PERMISSION_DENIED`.
9. **Immutable Field Tampering (`ownerId`)**: Updating `/users/user_1` with a modified `ownerId` -> `PERMISSION_DENIED`.
10. **Forged Client Timestamp (`updatedAt`)**: Updating `/users/user_1` with a past/future `updatedAt != request.time` -> `PERMISSION_DENIED`.
11. **Oversized String Resource Poisoning**: Creating `/users/user_1` with a 5,000-character `bio` (exceeding 240 chars) or invalid `username` regex -> `PERMISSION_DENIED`.
12. **Value Poisoning on Rating Update**: Updating `/users/user_1` with `rapidRating: "9999"` (string instead of bounded number) -> `PERMISSION_DENIED`.
