# Bondoo — Firebase Security Rules

React Native + Firebase app ke liye reference rules. Is web prototype me runtime effect nahi hai (yahan backend Supabase hai).

## Files
- `firestore.rules` — users, activities, rsvps, reports
- `storage.rules` — avatars + Gov-ID uploads

## Access model
- `users/{uid}` — read: owner OR verified; write: owner only, protected fields locked
- `activities/{id}` — read: verified; write: host only
- `activities/{id}/rsvps/{uid}` — read: verified; write: own rsvp
- `reports/{id}` — read: backend only; create: verified user
- `avatar/*` — read: owner OR verified; write: owner (image, < 2MB)
- `gov_id/*` — read: backend only; write: owner (image/pdf, < 8MB)

## "Verified" definition
Both must be true:
1. `request.auth.token.phone_number != null` — set after Firebase Phone OTP.
2. `request.auth.token.gov_id_verified == true` — custom claim set by a trusted Cloud Function after ID review.

### Set custom claim (Cloud Function)
```ts
import { getAuth } from 'firebase-admin/auth';
await getAuth().setCustomUserClaims(uid, { gov_id_verified: true });
```
Client must call `user.getIdToken(true)` to refresh the token.

## Protected fields on users/{uid}
Client cannot modify `trust_score`, `gov_id_verified`, `role`, or `created_at`. Trust Score updates only via Cloud Function.

## Deploy
```bash
firebase deploy --only firestore:rules,storage:rules
```
